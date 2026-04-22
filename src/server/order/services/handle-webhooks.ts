import { db } from "@/server/db";
import { ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC } from "../config";
import { getProvider } from "../providers/registry";
import type { Payment, Prisma } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import { appEvents } from "@/server/events/bus";
import {
  asyncSendPaymentNotification,
} from "@/lib/lark";
import type { PaymentWebhookResult } from "../providers/types";
import { grant } from "@/server/billing/services/grant";
import { createSubscriptionCycle } from "@/server/membership/services/create-subscription-cycle";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { consumeNewUserUnlockOffer } from "@/server/offers/services/consume-new-user-unlock-offer";
import type { NormalizedSubscriptionWebhookData } from "../providers/types";
import { getStripeClient } from "@/server/order/providers/stripe";
import {
  inferOccurredAtFromIsoFields,
  inferOccurredAtFromStripeObject,
  recordPaymentTransaction,
} from "@/server/order/services/payment-transactions";

/**
 * 用于标记“我们希望 Stripe 重放”的错误：
 * - 仅当履约/发放权益这类逻辑失败时抛出该错误；
 * - 其它错误（解析失败/无法映射到 payment 等）应尽量吞掉并返回 2xx，避免 Stripe 无限重试。
 */
export class WebhookFulfillmentError extends Error {
  constructor(cause: unknown) {
    super("Webhook fulfillment failed", { cause });
    this.name = "WebhookFulfillmentError";
  }
}

export async function handlePaymentWebhook(providerName: string, req: Request) {
  const provider = getProvider(providerName);
  const result = await provider.handlePaymentWebhook(req);
  logger.info(
    { provider: providerName, hasResult: !!result },
    "Handle payment webhook result"
  );
  if (!result) {
    logger.info(
      { provider: providerName },
      "Payment webhook ignored by provider"
    );
    return { status: "ignored" };
  }

  // subscription_id 优先，transaction_id 备用
  const subId = result.getGatewaySubscriptionId();
  const txnId = result.getGatewayTransactionId();
  const raw = result.getRawData() as {
    metadata?: { paymentId?: string; orderId?: string };
  } | null;

  let payment: Payment | null = null;
  if (subId) {
    payment = await db.payment.findFirst({ where: { gatewaySubscriptionId: subId } });
  }
  if (!payment && txnId) {
    payment = await db.payment.findFirst({ where: { gatewayTransactionId: txnId } });
  }
  // Fallback: use metadata.paymentId/orderId from checkout.session
  if (!payment && raw?.metadata?.paymentId) {
    payment = await db.payment.findUnique({ where: { id: raw.metadata.paymentId } });
  }
  if (!payment && raw?.metadata?.orderId) {
    payment = await db.payment.findFirst({ where: { orderId: raw.metadata.orderId }, orderBy: { createdAt: "desc" } });
  }

  // Stripe fallback:
  // Older Checkout sessions may not have populated PaymentIntent.metadata (or our DB row may not have gateway ids),
  // causing `payment_intent.*` webhooks to be unresolvable by txnId alone. In that case, try to look up the
  // Checkout Session via payment_intent and use its metadata.paymentId/orderId to map back.
  if (!payment && providerName.toUpperCase() === "STRIPE" && txnId) {
    try {
      const stripe = getStripeClient();
      const sessions = await stripe.checkout.sessions.list({ payment_intent: txnId, limit: 1 });
      const s = sessions.data?.[0];
      const meta = (s?.metadata ?? null) as { paymentId?: string; orderId?: string } | null;
      if (meta?.paymentId) {
        payment = await db.payment.findUnique({ where: { id: meta.paymentId } });
      }
      if (!payment && meta?.orderId) {
        payment = await db.payment.findFirst({ where: { orderId: meta.orderId }, orderBy: { createdAt: "desc" } });
      }
      logger.info(
        { provider: providerName, txnId, found: !!payment, sessionId: s?.id, metadata: meta },
        "Stripe fallback lookup by payment_intent"
      );
    } catch (e) {
      logger.warn({ provider: providerName, txnId, error: e }, "Stripe fallback lookup failed");
    }
  }
  
  if (!payment) {
    // Best-effort: still record Stripe cashflow for reconciliation even when we cannot map to Payment row.
    // This must NOT trigger fulfillment.
    if (providerName.toUpperCase() === "STRIPE" && result.getStatus() === "SUCCEEDED") {
      try {
        const rawAny = (result.getRawData() ?? null) as Record<string, unknown> | null;
        const obj = rawAny?.object;
        const chargeId = typeof rawAny?.id === "string" ? rawAny.id : null;
        const isCharge =
          obj === "charge" || (typeof chargeId === "string" && chargeId.startsWith("ch_"));

        if (isCharge) {
          // First principles: for Stripe, a "transaction" row represents a real cashflow.
          // We ONLY record on charge events, keyed by charge id (ch_*).
          const invoiceId = typeof rawAny?.invoice === "string" ? rawAny.invoice : null;
          const customerId = typeof rawAny?.customer === "string" ? rawAny.customer : null;
          const piId = typeof rawAny?.payment_intent === "string" ? rawAny.payment_intent : null;
          const amountCents = typeof rawAny?.amount === "number" ? rawAny.amount : null;
          const currency = typeof rawAny?.currency === "string" ? rawAny.currency : "usd";

          const occurredAt = inferOccurredAtFromStripeObject(rawAny) ?? new Date();

          // Resolve user via Stripe customer id (best-effort). If not resolvable, still write the row (userId=null).
          const userId =
            customerId
              ? (await db.user.findFirst({
                  where: { stripeCustomerId: customerId },
                  select: { id: true },
                }))?.id ?? null
              : null;

          if (chargeId && amountCents != null && amountCents > 0) {
            const desc = (typeof rawAny?.description === "string" ? rawAny.description : "").toLowerCase();
            let kind:
              | "ONE_OFF_CHARGE"
              | "SUBSCRIPTION_INITIAL_CHARGE"
              | "SUBSCRIPTION_UPDATE_CHARGE"
              | "SUBSCRIPTION_OTHER_CHARGE" =
              desc.includes("subscription") && desc.includes("update")
                ? "SUBSCRIPTION_UPDATE_CHARGE"
                : desc.includes("subscription") && desc.includes("creation")
                  ? "SUBSCRIPTION_INITIAL_CHARGE"
                  : desc.includes("subscription")
                    ? "SUBSCRIPTION_OTHER_CHARGE"
                    : "ONE_OFF_CHARGE";
            if (kind === "ONE_OFF_CHARGE" && invoiceId) kind = "SUBSCRIPTION_OTHER_CHARGE";

            await recordPaymentTransaction({
              userId,
              gateway: "STRIPE",
              externalId: chargeId,
              kind,
              amountCents,
              currency,
              occurredAt,
              orderId: null,
              paymentId: null,
              gatewayInvoiceId: invoiceId,
              gatewayChargeId: chargeId,
              gatewayPaymentIntentId: piId,
              sourceEventId: typeof rawAny?.__stripeEventId === "string" ? rawAny.__stripeEventId : null,
              sourceEventType: typeof rawAny?.__stripeEventType === "string" ? rawAny.__stripeEventType : null,
            });
          }
        }
      } catch (err) {
        logger.warn({ err }, "Stripe unmapped charge: failed to record payment transaction (ignored)");
      }
    }

    // NOTE:
    // Stripe 会向同一个 webhook endpoint 投递大量“与我们业务无关”的事件（或历史事件重放）。
    // 如果这里 throw 并返回 4xx，Stripe 会持续重放，造成噪音与潜在的状态回滚风险。
    // 对于无法映射到我们 Payment 的 webhook：记录告警并直接忽略（返回 2xx）。
    logger.warn(
      {
        provider: providerName,
        subscriptionId: subId,
        transactionId: txnId,
        rawMetadata: raw?.metadata,
      },
      "Payment not found for webhook"
    );
    return { status: "ignored" };
  }

  logger.info(
    {
      provider: providerName,
      paymentId: payment.id,
      orderId: payment.orderId,
      status: result.getStatus(),
      gatewayTransactionId: txnId,
      gatewaySubscriptionId: subId,
    },
    "Processing payment webhook"
  );

  const status = result.getStatus();

  // 记录更新前的状态，用于后续幂等判断
  const previousStatus = payment.status;

  // 防止 Stripe 重放/乱序导致“已成功的支付”被失败事件打回：
  // - 我们仅处理 `payment_intent.*` / `checkout.session.completed` 这类“过程事件”，不包含退款/拒付等逆向事件。
  // - 因此一旦 Payment 已经 SUCCEEDED，则不允许被 FAILED 覆盖。
  if (previousStatus === "SUCCEEDED" && status === "FAILED") {
    logger.warn(
      {
        provider: providerName,
        paymentId: payment.id,
        orderId: payment.orderId,
        previousStatus,
        incomingStatus: status,
        gatewayTransactionId: txnId ?? payment.gatewayTransactionId ?? undefined,
        gatewaySubscriptionId: subId ?? payment.gatewaySubscriptionId ?? undefined,
      },
      "Skip downgrading SUCCEEDED payment to FAILED (out-of-order/replayed webhook)"
    );
    return result.getData();
  }

  // 更新支付状态并补齐缺失的 gateway IDs
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status,
      gatewayTransactionId: payment.gatewayTransactionId ?? (txnId ?? undefined),
      gatewaySubscriptionId: payment.gatewaySubscriptionId ?? (subId ?? undefined),
      gatewayResponse: result.getRawData() as Prisma.JsonObject,
    },
  });

  // 支付失败则将同订单下未过期的 PENDING 置为 FAILED，并在订单仍 PENDING 时置为 CANCELLED
  if (status === "FAILED" && payment.orderId) {
    await db.payment.updateMany({
      where: {
        orderId: payment.orderId,
        status: "PENDING",
        id: { not: payment.id },
      },
      data: { status: "FAILED" },
    });

    const order = await db.order.findUnique({
      where: { id: payment.orderId },
      include: { product: true, user: { include: { referredBy: { select: { name: true, email: true } } } } },
    });
    if (order && order.status === "PENDING") {
      await db.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
    }

    // Send Lark notification for failed payment
    if (order) {
      const utm = {
        source: order.user?.utmSource ?? undefined,
        medium: order.user?.utmMedium ?? undefined,
        campaign: order.user?.utmCampaign ?? undefined,
      };

      const raw = (result.getRawData() ?? null) as Record<string, unknown> | null;
      const failureReason = (() => {
        // Stripe: payment_intent.payment_failed rawData is PaymentIntent
        if (providerName.toUpperCase() === "STRIPE" && raw && typeof raw === "object") {
          const status = typeof raw.status === "string" ? raw.status : undefined;
          const lpe = (raw.last_payment_error ?? null) as Record<string, unknown> | null;
          const message = typeof lpe?.message === "string" ? lpe.message : undefined;
          const type = typeof lpe?.type === "string" ? lpe.type : undefined;
          const code = typeof lpe?.code === "string" ? lpe.code : undefined;
          const declineCode = typeof lpe?.decline_code === "string" ? lpe.decline_code : undefined;

          const lines: string[] = [];
          if (message) lines.push(`- message: ${message}`);
          if (code) lines.push(`- code: ${code}`);
          if (declineCode) lines.push(`- decline_code: ${declineCode}`);
          if (type) lines.push(`- type: ${type}`);
          if (status) lines.push(`- payment_intent.status: ${status}`);

          return lines.length ? `Stripe payment failed\n${lines.join("\n")}` : "Stripe payment failed";
        }

        // NowPayments: include provider status if present
        if (providerName.toUpperCase() === "NOWPAYMENTS" && raw && typeof raw === "object") {
          const ps =
            typeof raw.payment_status === "string"
              ? raw.payment_status
              : typeof raw?.status === "string"
                ? raw.status
                : undefined;
          return ps ? `NowPayments failed (payment_status: ${ps})` : "NowPayments failed";
        }

        return undefined;
      })();

      asyncSendPaymentNotification({
        userName: order.user?.name ?? order.user?.email ?? order.userId,
        userEmail: order.user?.email ?? undefined,
        userCountryCode: order.user?.countryCode ?? undefined,
        amountCents: order.amount,
        currency: order.currency,
        productName: order.product?.name ?? "Unknown Product",
        orderId: order.id,
        paymentId: payment.id,
        gatewayTransactionId: txnId ?? payment.gatewayTransactionId ?? undefined,
        gatewaySubscriptionId: subId ?? payment.gatewaySubscriptionId ?? undefined,
        paymentUrl: payment.paymentUrl ?? undefined,
        gateway:
          providerName.toUpperCase() === "STRIPE"
            ? "stripe"
            : providerName.toUpperCase() === "NOWPAYMENTS"
              ? "nowpayments"
              : "other",
        nowpayments:
          providerName.toUpperCase() === "NOWPAYMENTS"
            ? (() => {
                const extra = payment.extra as unknown as { nowpayments?: Record<string, unknown> } | null;
                const np = extra?.nowpayments as
                  | {
                      payment_id?: unknown;
                      payment_status?: unknown;
                      pay_address?: unknown;
                      pay_amount?: unknown;
                      pay_currency?: unknown;
                      payin_hash?: unknown;
                      payout_hash?: unknown;
                      price_amount?: unknown;
                      price_currency?: unknown;
                    }
                  | undefined;
                const raw = (result.getRawData() ?? null) as Record<string, unknown> | null;
                return {
                  payment_id:
                    typeof np?.payment_id === "string"
                      ? np.payment_id
                      : typeof (raw?.payment_id) === "string"
                        ? raw.payment_id
                        : txnId ?? undefined,
                  payment_status:
                    typeof np?.payment_status === "string"
                      ? np.payment_status
                      : typeof raw?.payment_status === "string"
                        ? raw.payment_status
                        : undefined,
                  pay_address:
                    typeof np?.pay_address === "string"
                      ? np.pay_address
                      : typeof raw?.pay_address === "string"
                        ? raw.pay_address
                        : undefined,
                  pay_amount:
                    typeof np?.pay_amount === "number" || typeof np?.pay_amount === "string"
                      ? np.pay_amount
                      : typeof raw?.pay_amount === "number" || typeof raw?.pay_amount === "string"
                        ? raw.pay_amount
                        : undefined,
                  pay_currency:
                    typeof np?.pay_currency === "string"
                      ? np.pay_currency
                      : typeof raw?.pay_currency === "string"
                        ? raw.pay_currency
                        : undefined,
                  payin_hash:
                    typeof np?.payin_hash === "string"
                      ? np.payin_hash
                      : typeof raw?.payin_hash === "string"
                        ? raw.payin_hash
                        : undefined,
                  payout_hash:
                    typeof np?.payout_hash === "string"
                      ? np.payout_hash
                      : typeof raw?.payout_hash === "string"
                        ? raw.payout_hash
                        : undefined,
                  price_amount:
                    typeof np?.price_amount === "number" || typeof np?.price_amount === "string"
                      ? np.price_amount
                      : typeof raw?.price_amount === "number" || typeof raw?.price_amount === "string"
                        ? raw.price_amount
                        : undefined,
                  price_currency:
                    typeof np?.price_currency === "string"
                      ? np.price_currency
                      : typeof raw?.price_currency === "string"
                        ? raw.price_currency
                        : undefined,
                };
              })()
            : undefined,
        status: "failed",
        failureReason,
        isTest: process.env.NODE_ENV !== "production",
        utm,
        originalAmountCents: order.product?.originalPrice,
        referredBy: order.user?.referredBy
          ? { name: order.user.referredBy.name ?? undefined, email: order.user.referredBy.email ?? undefined }
          : undefined,
      });
    }
  }

  // 成功则触发履约
  if (status === "SUCCEEDED" && payment.orderId) {
    // Append-only cashflow record (best-effort, idempotent).
    // Stripe first-principles: ONLY record cashflow on charge events (charge.succeeded), keyed by ch_*.
    try {
      const gateway = providerName.toUpperCase();
      const gatewaySubId = subId ?? payment.gatewaySubscriptionId ?? undefined;

      {
        const rawObj = result.getRawData() as Record<string, unknown> | null;
        const rawObjectType = typeof rawObj?.object === "string" ? rawObj.object : null;

        // Stripe: only record when webhook payload is a charge.
        if (gateway === "STRIPE" && rawObjectType !== "charge") {
          // no-op
        } else {
          const orderForKind = await db.order.findUnique({
            where: { id: payment.orderId },
            select: { id: true, product: { select: { type: true } } },
          });
          const kind =
            orderForKind?.product?.type === "SUBSCRIPTION"
              ? "SUBSCRIPTION_INITIAL_CHARGE"
              : "ONE_OFF_CHARGE";

          const occurredAt =
            (providerName.toUpperCase() === "STRIPE"
              ? inferOccurredAtFromStripeObject(result.getRawData())
              : inferOccurredAtFromIsoFields(result.getRawData())) ?? new Date();

          // For Stripe, try to extract charge info from rawData if available.
          // For checkout.session.completed, rawData may not have charge; for charge.succeeded it will.
          const rawData = result.getRawData() as {
            id?: string;
            latest_charge?: string | { id: string } | null;
            charge?: string | { id: string } | null;
            payment_intent?: string | { id: string } | null;
          } | null;
          const gatewayChargeId =
            gateway === "STRIPE"
              ? (typeof rawData?.latest_charge === "string"
                  ? rawData.latest_charge
                  : typeof rawData?.latest_charge === "object" && rawData.latest_charge?.id
                    ? rawData.latest_charge.id
                    : typeof rawData?.charge === "string"
                      ? rawData.charge
                      : typeof rawData?.charge === "object" && rawData.charge?.id
                        ? rawData.charge.id
                        // If rawData.id starts with ch_, it's a charge object
                        : typeof rawData?.id === "string" && rawData.id.startsWith("ch_")
                          ? rawData.id
                          : null)
              : null;

          // Stripe: externalId is chargeId (ch_*). If missing, skip recording.
          const externalId =
            gateway === "STRIPE" ? (gatewayChargeId ?? "") : (txnId ?? payment.gatewayTransactionId ?? "").toString();

          if (externalId) {
            await recordPaymentTransaction({
              userId: payment.userId,
              gateway,
              externalId,
              kind,
              amountCents: payment.amount,
              currency: payment.currency,
              occurredAt,
              orderId: payment.orderId,
              paymentId: payment.id,
              gatewaySubscriptionId: gatewaySubId ?? null,
              gatewayChargeId,
              gatewayPaymentIntentId:
                gateway === "STRIPE"
                  ? (typeof rawData?.payment_intent === "string"
                      ? rawData.payment_intent
                      : typeof rawData?.payment_intent === "object" && rawData.payment_intent?.id
                        ? rawData.payment_intent.id
                        : null)
                  : null,
              sourceEventId: null,
              sourceEventType: gateway === "STRIPE" ? "charge.succeeded" : null,
            });
          }
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: providerName, paymentId: payment.id, orderId: payment.orderId },
        "Failed to record payment transaction (ignored)"
      );
    }

    // 幂等保护需要以「订单是否已履约」为准，而不是只看 payment.status。
    // 订阅类 webhook 可能先把 payment 标记为 SUCCEEDED（但不会履约订单），
    // 此时如果直接 return，会造成订单永远不 FULFILLED。
    if (previousStatus === "SUCCEEDED") {
      const order = await db.order.findUnique({
        where: { id: payment.orderId },
        select: { status: true, amount: true, userId: true },
      });
      if (order?.status === "FULFILLED") {
        // Ensure UserStats is updated even on idempotent skip (fix for missed updates)
        try {
          const existingStats = await db.userStats.findUnique({
            where: { userId: order.userId },
            select: { totalPaidCents: true },
          });
          if ((existingStats?.totalPaidCents ?? 0) === 0 && order.amount > 0) {
            await db.userStats.upsert({
              where: { userId: order.userId },
              create: {
                userId: order.userId,
                totalPaidCents: order.amount,
                ordersCount: 1,
                lastPaidAt: new Date(),
              },
              update: {
                totalPaidCents: { increment: order.amount },
                ordersCount: { increment: 1 },
                lastPaidAt: new Date(),
              },
            });
            logger.info(
              { provider: providerName, paymentId: payment.id, orderId: payment.orderId, amount: order.amount },
              "Backfilled UserStats on idempotent webhook skip"
            );
          }
        } catch (err) {
          logger.warn(
            { err, provider: providerName, paymentId: payment.id, orderId: payment.orderId },
            "Failed to backfill UserStats on idempotent skip (ignored)"
          );
        }
        logger.info(
          { provider: providerName, paymentId: payment.id, orderId: payment.orderId, previousStatus },
          "Payment already succeeded and order already fulfilled, skip"
        );
        return result.getData();
      }
      logger.warn(
        { provider: providerName, paymentId: payment.id, orderId: payment.orderId, previousStatus, orderStatus: order?.status },
        "Payment status was already SUCCEEDED but order not fulfilled; continue to fulfillment"
      );
    }

    // 调用履约域
    try {
      await import("@/server/fulfillment/manager").then((m) =>
        m.processFulfillmentByPayment(payment)
      );
      await db.order.update({
        where: { id: payment.orderId },
        data: { status: "FULFILLED" },
      });
      // Mark user as having purchased
      await db.user.update({
        where: { id: payment.userId },
        data: { hasPurchased: true },
      });

      // Optional: sync default payment preference after a successful purchase (AUTO -> gateway).
      if (ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC) {
        // NowPayments -> crypto
        if (providerName.toUpperCase() === "NOWPAYMENTS") {
          await db.user.updateMany({
            where: { id: payment.userId, paymentGatewayPreference: "AUTO" },
            data: { paymentGatewayPreference: "NOWPAYMENTS" },
          });
        }

        // Stripe -> card
        if (providerName.toUpperCase() === "STRIPE") {
          await db.user.updateMany({
            where: { id: payment.userId, paymentGatewayPreference: "AUTO" },
            data: { paymentGatewayPreference: "TELEGRAM_STARS" },
          });
        }
      }

      logger.info(
        {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: "FULFILLED",
        },
        "Order fulfilled after payment success"
      );

      await appEvents.emit("payment:succeeded", {
        paymentId: payment.id,
        orderId: payment.orderId!,
        userId: payment.userId,
        gateway: providerName,
        amountCents: payment.amount,
        currency: payment.currency,
        productType: "UNKNOWN",
      });

      // Skip Queue: 付费后将该用户的延迟任务插入快速队列，并清空当日队列计数
      try {
        const extra = payment.extra as unknown;
        const metadata =
          extra &&
          typeof extra === "object" &&
          "metadata" in (extra as Record<string, unknown>)
            ? ((extra as { metadata?: Record<string, unknown> }).metadata ?? undefined)
            : undefined;

        const isSkipQueue = metadata?.source === "skip_queue";

        if (isSkipQueue) {
          const userId = payment.userId;

          // TODO: Add any post-payment priority queue logic here
          const promotedCount = 0;

          logger.info(
            {
              userId,
              paymentId: payment.id,
              orderId: payment.orderId,
              promotedCount,
            },
            "Skip queue payment succeeded, promoted delayed jobs and reset daily generation count"
          );
        }
      } catch (error) {
        logger.error(
          { error, paymentId: payment.id, orderId: payment.orderId },
          "Failed to promote jobs or reset daily count after skip-queue payment"
        );
      }
      
      // 上报 PostHog 事件 & 更新用户统计
      const order = await db.order.findUnique({
        where: { id: payment.orderId },
        include: { product: { include: { creditsPackage: true } }, user: { include: { referredBy: { select: { name: true, email: true } } } } }
      });
      if (order) {
        // 更新用户聚合统计（UserStats）
        const now = new Date();

        // Consume limited-time offer if this payment used discounted new-user SKU
        if (order.productId === NEW_USER_UNLOCK_OFFER.discountedProductId) {
          await consumeNewUserUnlockOffer({ userId: order.userId, consumedAt: now });
        }

        await db.userStats.upsert({
          where: { userId: order.userId },
          create: {
            userId: order.userId,
            totalPaidCents: order.amount,
            ordersCount: 1,
            firstPaidAt: now,
            lastPaidAt: now,
          },
          update: {
            totalPaidCents: { increment: order.amount },
            ordersCount: { increment: 1 },
            lastPaidAt: now,
          },
        });

      }
    } catch (err) {
      logger.error(
        { err, paymentId: payment.id, orderId: payment.orderId },
        "Fulfillment failed after payment success"
      );
      throw new WebhookFulfillmentError(err);
    }
  }

  logger.info(
    {
      provider: providerName,
      paymentId: payment.id,
      status,
    },
    "Payment webhook processed successfully"
  );

  return result.getData();
}

// Stripe 订阅续费（invoice.payment_succeeded -> subscription_period > 1）
export async function handleStripeSubscriptionRenewal(
  result: PaymentWebhookResult
) {
  const gatewaySubId = result.getGatewaySubscriptionId();
  const txnId = result.getGatewayTransactionId();
  if (!gatewaySubId) {
    logger.error(
      {},
      "Stripe subscription renewal webhook missing gateway subscription id"
    );
    // Payload 本身缺字段，重放也不会变好：直接 2xx 吞掉，避免 Stripe 无限重试
    return result.getData();
  }

  if (!txnId) {
    logger.error(
      {},
      "Stripe subscription renewal webhook missing gateway transaction id"
    );
    // Payload 本身缺字段，重放也不会变好：直接 2xx 吞掉，避免 Stripe 无限重试
    return result.getData();
  }

  const subscription = await db.userSubscription.findFirst({
    where: { gatewaySubscriptionId: gatewaySubId },
    include: {
      cycles: {
        where: { status: "ACTIVE" },
        orderBy: { sequenceNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!subscription) {
    logger.error(
      { gatewaySubscriptionId: gatewaySubId },
      "UserSubscription not found for Stripe renewal"
    );
    // 找不到订阅通常是数据不一致或竞态；重放未必能修复，避免无限重试
    return result.getData();
  }

  // Note: Stripe cashflow is recorded exclusively on charge.succeeded (see handlePaymentWebhook).

  const activeCycle = subscription.cycles[0] ?? null;

  // 从 planSnapshot 中解析订阅计划信息（与首期履约逻辑保持一致）
  const snapshot = subscription.planSnapshot as unknown as {
    productSubscription?: {
      plan?: {
        interval?: string;
        intervalCount?: number;
        creditsPerPeriod?: number;
        creditsPerMonth?: number;
      };
    };
  };

  const plan = snapshot.productSubscription?.plan;
  if (!plan) {
    logger.warn(
      { subscriptionId: subscription.id },
      "Subscription plan snapshot missing, skip renewal fulfillment"
    );
    return result.getData();
  }

  const outerBizId = `subscription_renewal_${subscription.id}_${txnId}`;

  const rawInterval = (plan.interval ?? "").toString().toLowerCase();
  const interval =
    rawInterval === "week" || rawInterval === "month" || rawInterval === "year"
      ? rawInterval
      : "";
  const intervalCount =
    typeof plan.intervalCount === "number" && plan.intervalCount > 0
      ? plan.intervalCount
      : 1;

  const now = new Date();

  // 默认：新周期从上一个 ACTIVE 周期的 expiresAt 开始
  // Early-convert 场景（提前结束试用并扣款）：
  // - 当前 ACTIVE 周期为 TRIAL
  // - 且当前时间仍早于 TRIAL 的 expiresAt
  // 此时应视为“立即转正”，新周期应从 now 开始，而不是原本的 trial 结束时间。
  let periodStart = activeCycle?.expiresAt ?? now;
  if (activeCycle?.type === "TRIAL" && activeCycle.expiresAt > now) {
    periodStart = now;
  }
  const periodEnd = new Date(periodStart);
  if (interval === "week") {
    periodEnd.setDate(periodEnd.getDate() + 7 * intervalCount);
  } else if (interval === "month") {
    periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
  } else if (interval === "year") {
    periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
  } else {
    logger.warn(
      {
        subscriptionId: subscription.id,
        interval: plan.interval,
      },
      "Unsupported subscription interval in snapshot, skip renewal extension"
    );
    return result.getData();
  }

  const creditsPerPeriod =
    (typeof plan.creditsPerPeriod === "number" && plan.creditsPerPeriod > 0)
      ? plan.creditsPerPeriod
      : (typeof plan.creditsPerMonth === "number" && plan.creditsPerMonth > 0)
        ? plan.creditsPerMonth
        : 0;

  // 续费属于“发放权益/积分”的履约逻辑：如果 DB/发放失败，希望 Stripe 重放
  let newCycleSequenceNumber: number | undefined;
  try {
    // 幂等：先尝试创建周期，uniqueKey 已存在则说明本次续费已处理过
    const renewalUniqueKey = `sub_renewal_${subscription.id}_${txnId}`;
    const newCycle = await createSubscriptionCycle({
      subscriptionId: subscription.id,
      paymentId: undefined,
      uniqueKey: renewalUniqueKey,
      type: "REGULAR",
      startsAt: periodStart,
      expiresAt: periodEnd,
    });

    const isReplay = newCycle.createdAt.getTime() < Date.now() - 5000;
    if (isReplay) {
      logger.info(
        { subscriptionId: subscription.id, txnId, cycleId: newCycle.id },
        "Subscription renewal already processed (cycle exists), skipping"
      );
      return result.getData();
    }

    newCycleSequenceNumber = newCycle.sequenceNumber;

    // 新周期创建成功后，关闭旧的 ACTIVE 周期
    if (activeCycle && activeCycle.id !== newCycle.id) {
      await db.userSubscriptionCycle.update({
        where: { id: activeCycle.id },
        data: { status: "CLOSED" },
      });
    }

    // 续费成功时，恢复订阅为 ACTIVE 并清除取消标记
    await db.userSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
      },
    });

    if (creditsPerPeriod > 0) {
      // 续费首月积分的有效期：从本期周期开始时间起 1 个月
      const firstMonthCreditExpiresAt = new Date(periodStart);
      firstMonthCreditExpiresAt.setMonth(firstMonthCreditExpiresAt.getMonth() + 1);

      await grant({
        userId: subscription.userId,
        accountType: "CREDIT",
        subAccountType: "MEMBERSHIP",
        amount: creditsPerPeriod,
        outerBizId,
        businessType: "SUBSCRIPTION",
        referenceId: subscription.id,
        description: "Subscription Credits (renewal first month)",
        startsAt: periodStart,
        expiresAt: firstMonthCreditExpiresAt,
      });

      // 记录积分发放锚点，供后续按月发放逻辑使用
      await db.userSubscriptionCycle.update({
        where: { id: newCycle.id },
        data: {
          lastCreditGrantAnchor: periodStart,
        },
      });

      // 标记 Trial → 订阅转化（如果用户之前使用过 Pro Trial）
      await db.userStats.updateMany({
        where: {
          userId: subscription.userId,
          hasUsedProTrial: true,
          proTrialConverted: false,
        },
        data: {
          proTrialConverted: true,
        },
      });
    }

    // Affiliate earning is now handled by the event bus (subscription:renewed)
    await appEvents.emit("subscription:renewed", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      cycleNumber: newCycleSequenceNumber,
      amountCents: result.getAmount() ?? 0,
      currency: result.getCurrency() ?? "usd",
      periodStart,
      periodEnd,
    });
  } catch (error) {
    logger.error(
      { error, subscriptionId: subscription.id, gatewaySubscriptionId: gatewaySubId, transactionId: txnId },
      "Stripe renewal fulfillment failed"
    );
    throw new WebhookFulfillmentError(error);
  }

  logger.info(
    {
      subscriptionId: subscription.id,
      gatewaySubscriptionId: gatewaySubId,
      periodStart,
      periodEnd,
      creditsPerPeriod,
    },
    "Stripe subscription renewal processed"
  );

  // Lark: 订阅续费/提前转正（invoice.payment_succeeded）通知
  try {
    const [user, userStats] = await Promise.all([
      db.user.findUnique({
        where: { id: subscription.userId },
        select: {
          id: true,
          name: true,
          email: true,
          countryCode: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          referredBy: { select: { name: true, email: true } },
        },
      }),
      db.userStats.findUnique({
        where: { userId: subscription.userId },
        select: { totalPaidCents: true, ordersCount: true },
      }),
    ]);

    const amountCents = result.getAmount() ?? 0;
    const currency = result.getCurrency() ?? "usd";
    const rawInvoice = (result.getRawData() ?? null) as
      | {
          billing_reason?: string | null;
          attempt_count?: number | null;
          next_payment_attempt?: number | null;
        }
      | null;
    const planSnapshot = subscription.planSnapshot as unknown as {
      name?: string;
    } | null;

    asyncSendPaymentNotification({
      bizType: "subscription",
      subscriptionEvent: "renewal",
      subscriptionCycleNumber: newCycleSequenceNumber,
      subscriptionPeriodStart: periodStart.toISOString(),
      subscriptionPeriodEnd: periodEnd.toISOString(),
      subscriptionBillingReason: rawInvoice?.billing_reason ?? undefined,
      subscriptionAttemptCount:
        typeof rawInvoice?.attempt_count === "number" ? rawInvoice.attempt_count : undefined,
      subscriptionNextPaymentAttemptAt:
        typeof rawInvoice?.next_payment_attempt === "number"
          ? new Date(rawInvoice.next_payment_attempt * 1000).toISOString()
          : undefined,
      userName: user?.name ?? user?.email ?? subscription.userId,
      userEmail: user?.email ?? undefined,
      userCountryCode: user?.countryCode ?? undefined,
      amountCents,
      currency,
      productName: planSnapshot?.name ? `${planSnapshot.name} (Renewal)` : "Subscription Renewal",
      // 续费没有 Order，这里用稳定的业务 ID 方便检索
      orderId: `sub_renewal_${subscription.id}_${txnId}`,
      gateway: "stripe",
      status: "succeeded",
      isTest: process.env.NODE_ENV !== "production",
      credits: creditsPerPeriod > 0 ? creditsPerPeriod : undefined,
      utm: {
        source: user?.utmSource ?? undefined,
        medium: user?.utmMedium ?? undefined,
        campaign: user?.utmCampaign ?? undefined,
      },
      userStats: {
        isFirstOrder: false,
        totalSpentCents: userStats?.totalPaidCents ?? undefined,
      },
      referredBy: user?.referredBy
        ? { name: user.referredBy.name ?? undefined, email: user.referredBy.email ?? undefined }
        : undefined,
    });
  } catch (error) {
    logger.error(
      { error, subscriptionId: subscription.id, transactionId: txnId },
      "Failed to send subscription renewal payment notification"
    );
  }

  return result.getData();
}

export async function handleSubscriptionWebhook(providerName: string, req: Request) {
  const provider = getProvider(providerName);
  const result = await provider.handleSubscriptionWebhook(req);
  logger.info(
    { provider: providerName, hasResult: !!result },
    "Handle subscription webhook result"
  );

  if (!result) {
    logger.info(
      { provider: providerName },
      "Subscription webhook ignored by provider"
    );
    return { status: "ignored" };
  }

  // Stripe 续费 & 提前转正（early-convert trial）处理
  // - invoice.payment_succeeded 会作为订阅类事件进入这里；
  // - 默认仅当 subscriptionPeriod>1 时视为“续费”；
  // - 对于提前结束试用并立即扣款的场景（billing_reason=subscription_update 且 amount_paid>0，
  //   且当前订阅仍处于 TRIAL 周期），也应视为首个正式周期，复用续费的履约逻辑。
  const maybePaymentResult = result as unknown as PaymentWebhookResult;

  if (
    providerName.toUpperCase() === "STRIPE" &&
    typeof maybePaymentResult.getSubscriptionPeriod === "function" &&
    maybePaymentResult.getStatus() === "SUCCEEDED"
  ) {
    const raw = maybePaymentResult.getRawData() as
      | {
          object?: string;
          billing_reason?: string | null;
          amount_paid?: number | null;
        }
      | null;

    const isInvoice =
      raw?.object === "invoice" || raw?.object === "test_helpers.test_clock_advance.invoice";
    const isSubscriptionUpdateWithCharge =
      isInvoice &&
      raw?.billing_reason === "subscription_update" &&
      (raw?.amount_paid ?? 0) > 0;

    if (isSubscriptionUpdateWithCharge) {
      const gatewaySubId = maybePaymentResult.getGatewaySubscriptionId();

      if (gatewaySubId) {
        const subscription = await db.userSubscription.findFirst({
          where: { gatewaySubscriptionId: gatewaySubId },
          include: {
            cycles: {
              where: { status: "ACTIVE" },
              orderBy: { sequenceNumber: "desc" },
              take: 1,
            },
          },
        });

        const activeCycle = subscription?.cycles[0] ?? null;

        // 仅当当前仍处于 TRIAL 周期时，才将该事件视为“提前转正”的首个正式周期
        if (subscription && activeCycle?.type === "TRIAL") {
          logger.info(
            {
              provider: providerName,
              subscriptionId: subscription.id,
              gatewaySubscriptionId: gatewaySubId,
              billingReason: raw?.billing_reason,
              amountPaid: raw?.amount_paid,
            },
            "Routing Stripe early-convert trial webhook as renewal"
          );

          return handleStripeSubscriptionRenewal(maybePaymentResult);
        }
      }
    }

    // Stripe 正常续费：subscriptionPeriod>1
    if (maybePaymentResult.getSubscriptionPeriod() > 1) {
    logger.info(
      {
        provider: providerName,
        subscriptionId: maybePaymentResult.getGatewaySubscriptionId(),
        subscriptionPeriod: maybePaymentResult.getSubscriptionPeriod(),
      },
      "Routing Stripe subscription renewal webhook"
    );
    return handleStripeSubscriptionRenewal(maybePaymentResult);
    }
  }

  // Stripe: 订阅扣款失败（invoice.payment_failed）也属于“支付通知”，否则会出现支付通知不全
  if (providerName.toUpperCase() === "STRIPE") {
    const maybePayment = result as unknown as PaymentWebhookResult;
    const raw = maybePayment.getRawData() as
      | {
          object?: string;
          id?: string;
          billing_reason?: string | null;
          attempt_count?: number | null;
          next_payment_attempt?: number | null;
          amount_due?: number | null;
          currency?: string | null;
          last_finalization_error?: { message?: string | null } | null;
          last_payment_error?: { message?: string | null } | null;
        }
      | null;

    const isInvoice =
      raw?.object === "invoice" || raw?.object === "test_helpers.test_clock_advance.invoice";

    if (isInvoice && maybePayment.getStatus() === "FAILED") {
      try {
        const gatewaySubId = maybePayment.getGatewaySubscriptionId();
        if (gatewaySubId) {
          const subscription = await db.userSubscription.findFirst({
            where: { gatewaySubscriptionId: gatewaySubId },
          });
          const userId = subscription?.userId;

          const user = userId
            ? await db.user.findUnique({
                where: { id: userId },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  countryCode: true,
                  utmSource: true,
                  utmMedium: true,
                  utmCampaign: true,
                  referredBy: { select: { name: true, email: true } },
                },
              })
            : null;

          const amountCents = maybePayment.getAmount() ?? (raw?.amount_due ?? 0);
          const currency = maybePayment.getCurrency() ?? raw?.currency ?? "usd";
          const failureReason =
            raw?.last_payment_error?.message ??
            raw?.last_finalization_error?.message ??
            undefined;

          asyncSendPaymentNotification({
            bizType: "subscription",
            subscriptionEvent: "invoice_failed",
            userName: user?.name ?? user?.email ?? userId ?? gatewaySubId,
            userEmail: user?.email ?? undefined,
            userCountryCode: user?.countryCode ?? undefined,
            amountCents,
            currency,
            productName: "Subscription Payment",
            orderId: `sub_invoice_failed_${gatewaySubId}_${maybePayment.getGatewayTransactionId() ?? raw?.id ?? "unknown"}`,
            gateway: "stripe",
            status: "failed",
            failureReason,
            subscriptionBillingReason: raw?.billing_reason ?? undefined,
            subscriptionAttemptCount:
              typeof raw?.attempt_count === "number" ? raw.attempt_count : undefined,
            subscriptionNextPaymentAttemptAt:
              typeof raw?.next_payment_attempt === "number"
                ? new Date(raw.next_payment_attempt * 1000).toISOString()
                : undefined,
            isTest: process.env.NODE_ENV !== "production",
            utm: {
              source: user?.utmSource ?? undefined,
              medium: user?.utmMedium ?? undefined,
              campaign: user?.utmCampaign ?? undefined,
            },
            referredBy: user?.referredBy
              ? { name: user.referredBy.name ?? undefined, email: user.referredBy.email ?? undefined }
              : undefined,
          });
        }
      } catch (error) {
        logger.error({ error }, "Failed to send subscription payment failed notification");
      }
    }
  }

  const subId = result.getGatewaySubscriptionId();
  const payment = subId
    ? await db.payment.findFirst({
        where: { gatewaySubscriptionId: subId },
      })
    : null;

  if (payment) {
    logger.info(
      {
        provider: providerName,
        paymentId: payment.id,
        subscriptionId: subId,
        status: result.getStatus(),
      },
      "Processing subscription webhook (payment mutation)"
    );

    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: result.getStatus(),
        gatewayResponse: result.getRawData() as Prisma.JsonObject,
      },
    });

    // Stripe: invoice.payment_succeeded for subscription initial charge (subscriptionPeriod=1)
    // Best-effort backfill Payment.gatewayTransactionId (cashflow is recorded on charge.succeeded).
    if (providerName.toUpperCase() === "STRIPE" && result.getStatus() === "SUCCEEDED") {
      try {
        const maybePaymentResult = result as unknown as PaymentWebhookResult;
        const raw = maybePaymentResult.getRawData() as
          | { object?: string; id?: string }
          | null;
        const isInvoice =
          raw?.object === "invoice" ||
          raw?.object === "test_helpers.test_clock_advance.invoice";
        const invoiceId = maybePaymentResult.getGatewayTransactionId();

        // Renewals are routed earlier and won't reach here; this branch is effectively "initial invoice".
        if (isInvoice && invoiceId) {
          await db.payment.updateMany({
            where: { id: payment.id, gatewayTransactionId: null },
            data: { gatewayTransactionId: invoiceId },
          });
        }
      } catch (error) {
        logger.warn(
          { error, provider: providerName, paymentId: payment.id, subscriptionId: subId },
          "Failed to record Stripe initial subscription invoice transaction (ignored)"
        );
      }
    }

    logger.info(
      {
        provider: providerName,
        paymentId: payment.id,
        subscriptionId: subId,
        status: result.getStatus(),
      },
      "Subscription webhook processed successfully (payment updated)"
    );
  } else if (subId) {
    logger.warn(
      {
        provider: providerName,
        subscriptionId: subId,
      },
      "Payment not found for subscription webhook, skipping payment update"
    );
  }

  // 同步 membership 订阅状态（按 gatewaySubscriptionId 查找）
  if (subId) {
    const userSub = await db.userSubscription.findFirst({
      where: { gatewaySubscriptionId: subId },
    });
    if (userSub) {
      const status = result.getStatus();
      const now = new Date();
      const normalized = (result as unknown as { getNormalizedData?: () => NormalizedSubscriptionWebhookData })
        .getNormalizedData?.();

      const cancelAtPeriodEndFromGateway =
        typeof normalized?.cancelAtPeriodEnd === "boolean" ? normalized.cancelAtPeriodEnd : undefined;

      const canceledAtFromGateway =
        normalized?.canceledAt instanceof Date ? normalized.canceledAt : null;
      const endedAtFromGateway =
        normalized?.endedAt instanceof Date ? normalized.endedAt : null;

      if (status === "SUCCEEDED") {
        // Provider-agnostic: providers normalize their cancellation semantics into cancelAtPeriodEnd.
        // If provider doesn't send the field, keep current DB value.
        const nextCancelAtPeriodEnd =
          typeof cancelAtPeriodEndFromGateway === "boolean"
            ? cancelAtPeriodEndFromGateway
            : userSub.cancelAtPeriodEnd;

        const shouldSetCanceledAt =
          nextCancelAtPeriodEnd === true && userSub.canceledAt == null;

        const updatedSub = await db.userSubscription.update({
          where: { id: userSub.id },
          data: {
            status: "ACTIVE",
            cancelAtPeriodEnd: nextCancelAtPeriodEnd,
            // “取消”分两种：
            // - cancelAtPeriodEnd=true：仅表示停止续费，权益仍应持续到当前周期结束（cycle.expiresAt）
            //   因此这里记录 canceledAt（若 Stripe 提供 canceled_at 则优先），但不要设置 endedAt。
            // - cancelAtPeriodEnd=false：表示未取消续费（可能是用户恢复订阅），此时清理 canceledAt/endedAt。
            canceledAt: nextCancelAtPeriodEnd
              ? (canceledAtFromGateway ?? (shouldSetCanceledAt ? now : userSub.canceledAt))
              : null,
            endedAt: null,
          },
        });

        // Emit subscription:canceled event for any side-effect modules (e.g. touch)
        if (nextCancelAtPeriodEnd === true) {
          await appEvents.emit("subscription:canceled", {
            subscriptionId: updatedSub.id,
            userId: updatedSub.userId,
            cancelAtPeriodEnd: true,
          });
        }
        logger.info(
          {
            subscriptionId: userSub.id,
            gatewaySubscriptionId: subId,
            cancelAtPeriodEnd: cancelAtPeriodEndFromGateway,
          },
          "Synced subscription as ACTIVE via subscription webhook"
        );
        return result.getData();
      }
      if (status === "FAILED") {
        await db.userSubscription.update({
          where: { id: userSub.id },
          data: {
            status: "PAST_DUE",
            cancelAtPeriodEnd:
              typeof cancelAtPeriodEndFromGateway === "boolean"
                ? cancelAtPeriodEndFromGateway
                : true,
            canceledAt: userSub.canceledAt ?? now,
          },
        });
        logger.info(
          {
            subscriptionId: userSub.id,
            gatewaySubscriptionId: subId,
          },
          "Marked subscription as PAST_DUE via subscription webhook"
        );
      } else if (status === "EXPIRED") {
        await db.userSubscription.update({
          where: { id: userSub.id },
          data: {
            status: "CANCELED",
            cancelAtPeriodEnd: false,
            canceledAt: userSub.canceledAt ?? canceledAtFromGateway ?? now,
            endedAt: userSub.endedAt ?? endedAtFromGateway ?? now,
          },
        });
        logger.info(
          {
            subscriptionId: userSub.id,
            gatewaySubscriptionId: subId,
          },
          "Marked subscription as CANCELED via subscription webhook"
        );
      }
    }
  }

  return result.getData();
}

