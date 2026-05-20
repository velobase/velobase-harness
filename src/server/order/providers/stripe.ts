import type Stripe from "stripe";
import { BaseWebhookResult, type PaymentProvider, type ProviderOrder, type ProviderPayment } from "./types";
import { getStripeWebhookSecret } from "@/server/shared/env";
import { logger } from "@/server/shared/telemetry/logger";
import {
  stripeCheckoutSessionSchema,
  stripePaymentIntentSchema,
  stripeSubscriptionSchema,
} from "../schemas/webhook";
import { db } from "@/server/db";
import {
  voidAffiliateEarningsForRefund,
  voidAffiliateEarningsForStripeInvoiceRefund,
} from "@/server/affiliate/services/ledger";
import type { NormalizedSubscriptionWebhookData } from "./types";
import { getStripe } from "@/server/order/services/stripe/client";

export { getStripe as getStripeClient } from "@/server/order/services/stripe/client";

// Stripe Clover 版本 webhook payload 的 invoice.subscription 可能缺失，
// 需要从多个路径提取 subscription id（与 backfill 脚本逻辑保持一致）。
function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const inv = invoice as unknown as Record<string, unknown>;

  const getId = (v: unknown): string | undefined => {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string" && id) return id;
    }
    return undefined;
  };

  // 0) legacy: invoice.subscription
  const legacy = getId(inv.subscription);
  if (legacy) return legacy;

  // 1) new: invoice.parent.subscription_details.subscription
  const parent = inv.parent as Record<string, unknown> | null | undefined;
  const subDetails = parent?.subscription_details as Record<string, unknown> | null | undefined;
  const parentSub = getId(subDetails?.subscription);
  if (parentSub) return parentSub;

  // 2) fallback: invoice.lines.data[0].subscription
  const lines = inv.lines as Record<string, unknown> | null | undefined;
  const data = lines?.data as unknown[] | null | undefined;
  const line0 = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null;
  const lineSub = getId(line0?.subscription);
  if (lineSub) return lineSub;

  // 3) fallback: invoice.lines.data[0].parent.subscription_item_details.subscription
  const lineParent = (line0?.parent as Record<string, unknown> | null | undefined) ?? null;
  const itemDetails = lineParent?.subscription_item_details as Record<string, unknown> | null | undefined;
  const lineParentSub = getId(itemDetails?.subscription);
  if (lineParentSub) return lineParentSub;

  return undefined;
}

/**
 * 处理 Stripe 退款/拒付事件，作废关联的 affiliate earning（幂等）
 */
async function handleStripeRefundOrDispute(params: {
  eventId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  reason: string;
}): Promise<void> {
  const { eventId, paymentIntentId, invoiceId, reason } = params;

  // 1. 尝试作废 ORDER_PAYMENT 的 affiliate earning（通过 paymentIntentId 找 payment）
  if (paymentIntentId) {
    try {
      const payment = await db.payment.findFirst({
        where: { gatewayTransactionId: paymentIntentId },
        select: { id: true },
      });
      if (payment) {
        await voidAffiliateEarningsForRefund({
          paymentId: payment.id,
          idempotencyKey: `stripe_${reason}:${eventId}:payment:${payment.id}`,
        });
        logger.info(
          { paymentId: payment.id, paymentIntentId, reason },
          "Voided affiliate earning for ORDER_PAYMENT refund/dispute"
        );
      }
    } catch (error) {
      logger.error(
        { error, paymentIntentId, reason },
        "Failed to void affiliate earning for ORDER_PAYMENT (ignored)"
      );
    }
  }

  // 2. 尝试作废 SUBSCRIPTION_RENEWAL 的 affiliate earning（通过 invoiceId）
  if (invoiceId) {
    try {
      await voidAffiliateEarningsForStripeInvoiceRefund({
        invoiceId,
        idempotencyKey: `stripe_${reason}:${eventId}:invoice:${invoiceId}`,
      });
      logger.info(
        { invoiceId, reason },
        "Voided affiliate earning for SUBSCRIPTION_RENEWAL refund/dispute"
      );
    } catch (error) {
      logger.error(
        { error, invoiceId, reason },
        "Failed to void affiliate earning for SUBSCRIPTION_RENEWAL (ignored)"
      );
    }
  }
}

export const stripeProvider: PaymentProvider = {
  async confirmPayment(params: { gatewayCheckoutId?: string; checkoutSessionId?: string; gatewayTransactionId?: string }) {
    const stripe = getStripe();
    const checkoutSessionId = params.gatewayCheckoutId ?? params.checkoutSessionId;
    const gatewayTransactionId = params.gatewayTransactionId;

    // Prefer Checkout Session when available (subscription mode)
    if (checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      const isPaid = session.payment_status === "paid";
      return {
        isPaid,
        gatewayTransactionId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
        gatewaySubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
      };
    }

    // Fallback: PaymentIntent
    if (gatewayTransactionId) {
      const pi = await stripe.paymentIntents.retrieve(gatewayTransactionId);
      return {
        isPaid: pi.status === "succeeded",
        gatewayTransactionId: pi.id,
      };
    }

    return { isPaid: false };
  },

  async expireCheckoutSession(checkoutSessionId: string) {
    const stripe = getStripe();
    await stripe.checkout.sessions.expire(checkoutSessionId);
  },

  async createPayment({ payment, order }: { payment: ProviderPayment; order: ProviderOrder }) {
    const stripe = getStripe();
    const stripeCustomerId = (payment.extra?.stripeCustomerId as string | undefined) ?? undefined;
    const extraMetadata =
      payment.extra &&
      typeof payment.extra === "object" &&
      "metadata" in payment.extra &&
      payment.extra.metadata &&
      typeof payment.extra.metadata === "object"
        ? (payment.extra.metadata as Record<string, unknown>)
        : undefined;

    // Stripe metadata 只能是字符串，这里做一次安全过滤
    const stripeMetadata: Record<string, string> = {
      orderId: order.id,
      paymentId: payment.id,
    };
    if (extraMetadata) {
      for (const [key, value] of Object.entries(extraMetadata)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          stripeMetadata[key] = String(value);
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: order.currency,
            unit_amount: order.amount,
            product_data: { name: order.productSnapshot?.name ?? "Product" },
          },
          quantity: 1,
        },
      ],
      success_url: payment.extra?.SuccessURL ?? "https://example.com/success",
      cancel_url: payment.extra?.CancelURL ?? "https://example.com/cancel",
      customer: stripeCustomerId,
      // IMPORTANT:
      // We MUST attach paymentId/orderId onto PaymentIntent.metadata, otherwise
      // `payment_intent.succeeded` / `payment_intent.payment_failed` webhooks cannot
      // be reliably mapped back to our DB payment row.
      payment_intent_data: {
        metadata: stripeMetadata,
        // 优化 3DS：移除 setup_future_usage，不再强制请求“未来后台扣款权限”。
        // 这将大幅降低单次购买（如积分包）触发 3DS 的概率。
        // ...(stripeCustomerId ? { setup_future_usage: "off_session" as const } : {}),
      },
      metadata: stripeMetadata,
    });

    return {
      paymentUrl: session.url!,
      // 交易主 ID：PaymentIntent
      gatewayTransactionId: session.payment_intent as string | undefined,
      // 补偿用的 Checkout Session ID
      gatewayCheckoutId: session.id,
      checkoutSessionId: session.id,
    };
  },

  async createSubscription({ payment, order }: { payment: ProviderPayment; order: ProviderOrder }) {
    const stripe = getStripe();
    const stripeCustomerId = (payment.extra?.stripeCustomerId as string | undefined) ?? undefined;
    const extraMetadata =
      payment.extra &&
      typeof payment.extra === "object" &&
      "metadata" in payment.extra &&
      payment.extra.metadata &&
      typeof payment.extra.metadata === "object"
        ? (payment.extra.metadata as Record<string, unknown>)
        : undefined;

    // Stripe metadata 只能是字符串，这里做一次安全过滤
    const stripeMetadata: Record<string, string> = {
      orderId: order.id,
      paymentId: payment.id,
    };
    if (extraMetadata) {
      for (const [key, value] of Object.entries(extraMetadata)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          stripeMetadata[key] = String(value);
        }
      }
    }

    // 从商品快照中读取 trial 配置（仅订阅产品才会有）
    const snapshot = order.productSnapshot as
      | ({
          hasTrial?: boolean;
          trialDays?: number | null;
        } & Record<string, unknown>)
      | null
      | undefined;

    const hasTrial =
      !!snapshot?.hasTrial &&
      typeof snapshot.trialDays === "number" &&
      snapshot.trialDays > 0;

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData | undefined =
      hasTrial && typeof snapshot?.trialDays === "number"
        ? {
            trial_period_days: snapshot.trialDays,
          }
        : undefined;

    // Optional: enforce offer expiry on Checkout Session (prevent "占坑" after countdown ends)
    // Stripe requires expires_at to be between now+30min and now+24h
    const offerEndsAtIso =
      extraMetadata && typeof extraMetadata.offerEndsAt === "string"
        ? extraMetadata.offerEndsAt
        : undefined;
    let offerExpiresAt: number | undefined;
    if (offerEndsAtIso && !Number.isNaN(Date.parse(offerEndsAtIso))) {
      const rawExpiry = Math.floor(Date.parse(offerEndsAtIso) / 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      const minExpiry = nowSec + 30 * 60; // Stripe minimum: now + 30min
      const maxExpiry = nowSec + 24 * 60 * 60; // Stripe maximum: now + 24h
      offerExpiresAt = Math.min(Math.max(rawExpiry, minExpiry), maxExpiry);
    }

    // High Value Protection: Force 3DS for high-value subscriptions to reduce friendly fraud.
    // NOTE: order.amount is in the order currency's smallest unit (not always USD cents).
    // We use a conservative threshold (27000) to cover GBP yearly pricing (e.g. 27600) while keeping logic simple.
    // If you need an exact USD threshold across currencies, base it on the USD base price (product snapshot) instead.
    const shouldForce3DS = order.amount > 27000;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(shouldForce3DS && {
        payment_method_options: {
          card: {
            request_three_d_secure: "any",
          },
        },
      }),
      line_items: [
        {
          price_data: {
            currency: order.currency,
            unit_amount: order.amount,
            recurring: {
              interval: (order.productSnapshot?.interval ?? "month") as
                | "week"
                | "month"
                | "year",
            },
            product_data: { name: order.productSnapshot?.name ?? "Subscription" },
          },
          quantity: 1,
        },
      ],
      success_url: payment.extra?.SuccessURL ?? "https://example.com/success",
      cancel_url: payment.extra?.CancelURL ?? "https://example.com/cancel",
      customer: stripeCustomerId,
      // 允许复用已保存的支付方式
      // 优化 3DS：移除显式的 payment_method_save: "enabled"。
      // Subscription 模式本身就会保存卡用于续费，不需要额外请求通用存卡权限，这能降低风控敏感度。
      // saved_payment_method_options: stripeCustomerId
      //   ? {
      //       payment_method_save: "enabled",
      //     }
      //   : undefined,
      // Trial 订阅：在 Checkout 阶段即创建处于 trialing 状态的 Subscription
      subscription_data: subscriptionData,
      ...(offerExpiresAt ? { expires_at: offerExpiresAt } : {}),
      metadata: stripeMetadata,
    });

    return {
      paymentUrl: session.url!,
      gatewaySubscriptionId: session.subscription as string,
      // 订阅场景同样记录 Checkout Session ID，方便后续排查或补偿
      gatewayCheckoutId: session.id,
      checkoutSessionId: session.id,
    };
  },

  async handlePaymentWebhook(req: Request) {
    const stripe = getStripe();
    const signature = req.headers.get("stripe-signature");
    if (!signature) return null;
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
    logger.info({ type: event.type, id: event.id }, "Stripe payment webhook received");

    switch (event.type) {
      case "checkout.session.completed": {
        const session = stripeCheckoutSessionSchema.parse(event.data.object);
        logger.info({
          type: event.type,
          id: event.id,
          payment_intent: session.payment_intent,
          subscription: session.subscription,
          metadata: session.metadata,
        }, "Stripe checkout.session.completed parsed");
        return new BaseWebhookResult({
          status: "SUCCEEDED",
          gatewayTransactionId: session.payment_intent ?? undefined,
          gatewaySubscriptionId: session.subscription ?? undefined,
          rawData: session,
        });
      }
      case "payment_intent.succeeded": {
        const pi = stripePaymentIntentSchema.parse(event.data.object);
        logger.info({ id: pi.id, status: pi.status }, "Stripe payment_intent.succeeded parsed");
        // 忽略 payment_intent.succeeded 事件：
        // 1. 对于 Checkout 流程，我们依赖 checkout.session.completed 来触发履约。
        // 2. payment_intent.succeeded 会与 checkout.session.completed 并发到达，导致重复履约竞态条件。
        // 3. 只有非 Checkout 流程（如直接 Elements 调用）才依赖此事件，但我们全站都用 Checkout。
        return null;
      }
      case "payment_intent.payment_failed": {
        const pi = stripePaymentIntentSchema.parse(event.data.object);
        logger.info({ id: pi.id, status: pi.status }, "Stripe payment_intent.payment_failed parsed");
        return new BaseWebhookResult({ status: "FAILED", gatewayTransactionId: pi.id, rawData: pi });
      }

      // 关键：对账/记流水用（不触发履约）
      // - 有些订阅首扣/升级扣款会出现 charge.invoice 为空 + PI.metadata 为空的情况，
      //   此时 invoices.list / invoice.payment_succeeded 覆盖不到，但 Stripe 仍会发出 charge.succeeded。
      // - 注意：charge.succeeded 事件顺序可能早于 checkout.session.completed。
      //   如果把它作为 SUCCEEDED 返回给通用 handle-webhooks，会导致：
      //   1) Payment.status 被提前置为 SUCCEEDED（此时 gatewaySubscriptionId 可能尚未补齐）
      //   2) 触发履约（SubscriptionFulfiller），从而创建 gatewaySubscriptionId = "" 的订阅记录
      // - 因此这里必须“只记账，不触发通用 webhook 流程”，即：自行 best-effort 写入 PaymentTransaction，然后 return null。
      case "charge.succeeded": {
        const charge = event.data.object as {
          id: string;
          paid?: boolean;
          status?: string;
          amount?: number;
          currency?: string;
          created?: number;
          customer?: string | null;
          invoice?: string | null;
          payment_intent?: string | null;
          description?: string | null;
          metadata?: Record<string, string> | null;
        };

        // Only care about successful charges; ignore others.
        if (charge.paid !== true || charge.status !== "succeeded") return null;

        // Invoice-backed charges are tracked via invoice.payment_succeeded; skip to avoid duplicate cashflow records.
        if (typeof charge.invoice === "string" && charge.invoice.length > 0) return null;

        // Best-effort: resolve user by Stripe customer id and record cashflow.
        try {
          const customerId = typeof charge.customer === "string" ? charge.customer : null;
          const amountCents = typeof charge.amount === "number" ? charge.amount : null;
          const currency = typeof charge.currency === "string" ? charge.currency : "usd";
          const occurredAt =
            typeof charge.created === "number" && Number.isFinite(charge.created)
              ? new Date(charge.created * 1000)
              : new Date();

          if (!customerId || !amountCents || amountCents <= 0) return null;

          const userId =
            (await db.user.findFirst({
              where: { stripeCustomerId: customerId },
              select: { id: true },
            }))?.id ?? null;

          if (!userId) return null;

          const desc = (typeof charge.description === "string" ? charge.description : "").toLowerCase();
          const kind =
            desc.includes("subscription") && desc.includes("update")
              ? "SUBSCRIPTION_UPDATE_CHARGE"
              : desc.includes("subscription") && desc.includes("creation")
                ? "SUBSCRIPTION_INITIAL_CHARGE"
                : desc.includes("subscription")
                  ? "SUBSCRIPTION_OTHER_CHARGE"
                  : "ONE_OFF_CHARGE";

          const { recordPaymentTransaction } = await import("@/server/order/services/payment-transactions");

          await recordPaymentTransaction({
            userId,
            gateway: "STRIPE",
            // Stripe PaymentTransaction is keyed by charge id (ch_*) — see recordPaymentTransaction guard.
            externalId: charge.id,
            kind,
            amountCents,
            currency,
            occurredAt,
            orderId: null,
            paymentId: null,
            gatewayInvoiceId: null,
            gatewaySubscriptionId: null,
            gatewayChargeId: charge.id,
            gatewayPaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
            sourceEventId: event.id,
            sourceEventType: event.type,
          });
        } catch (err) {
          logger.warn({ err, eventId: event.id }, "Stripe charge.succeeded: failed to record payment transaction (ignored)");
        }

        // IMPORTANT: return null to avoid triggering fulfillment / payment status changes.
        return null;
      }

      // 退款事件：作废关联的 affiliate earning（幂等）
      case "charge.refunded": {
        const charge = event.data.object as {
          id: string;
          payment_intent?: string | null;
          invoice?: string | null;
          refunded: boolean;
        };
        logger.info(
          { chargeId: charge.id, paymentIntent: charge.payment_intent, invoice: charge.invoice, refunded: charge.refunded },
          "Stripe charge.refunded received"
        );
        if (charge.refunded) {
          await handleStripeRefundOrDispute({
            eventId: event.id,
            chargeId: charge.id,
            paymentIntentId: charge.payment_intent ?? null,
            invoiceId: charge.invoice ?? null,
            reason: "refund",
          });
        }
        // 返回 REFUNDED 状态，让 handle-webhooks 更新 payment 状态
        return new BaseWebhookResult({
          status: "REFUNDED",
          gatewayTransactionId: charge.payment_intent ?? undefined,
          rawData: charge,
        });
      }

      // 拒付事件：资金被扣回时作废 affiliate earning
      case "charge.dispute.funds_withdrawn": {
        const dispute = event.data.object as {
          id: string;
          charge?: string | null;
          payment_intent?: string | null;
          reason?: string | null;
        };
        logger.info(
          { disputeId: dispute.id, charge: dispute.charge, paymentIntent: dispute.payment_intent, reason: dispute.reason },
          "Stripe charge.dispute.funds_withdrawn received"
        );
        // 通过 payment_intent 作废一次性购买的佣金
        await handleStripeRefundOrDispute({
          eventId: event.id,
          chargeId: dispute.charge ?? null,
          paymentIntentId: dispute.payment_intent ?? null,
          invoiceId: null, // 订阅拒付通过 invoice.voided 处理
          reason: `dispute:${dispute.reason ?? "unknown"}`,
        });
        return new BaseWebhookResult({
          status: "REFUNDED",
          gatewayTransactionId: dispute.payment_intent ?? undefined,
          rawData: dispute,
        });
      }

      // 订阅发票作废：作废对应的续费佣金
      case "invoice.voided": {
        const invoice = event.data.object as {
          id: string;
          subscription?: string | null;
        };
        logger.info(
          { invoiceId: invoice.id, subscriptionId: invoice.subscription },
          "Stripe invoice.voided received"
        );
        if (invoice.id) {
          await handleStripeRefundOrDispute({
            eventId: event.id,
            chargeId: null,
            paymentIntentId: null,
            invoiceId: invoice.id,
            reason: "invoice_voided",
          });
        }
        return null; // invoice.voided 不需要更新 payment 状态
      }

      default:
        logger.info({ type: event.type }, "Stripe payment webhook event ignored");
        return null;
    }
  },

  async handleSubscriptionWebhook(req: Request) {
    const stripe = getStripe();
    const signature = req.headers.get("stripe-signature");
    if (!signature) return null;
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret()
    );
    logger.info(
      { type: event.type, id: event.id },
      "Stripe subscription webhook received"
    );

    switch (event.type) {
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        // 新版 Stripe SDK: subscription 字段移到 parent.subscription_details.subscription
        const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
        const isRenewal = invoice.billing_reason === "subscription_cycle";
        const subscriptionPeriod = isRenewal ? 2 : 1;

        logger.info(
          {
            id: invoice.id,
            subscriptionId,
            billingReason: invoice.billing_reason,
            subscriptionPeriod,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
          },
          "Stripe invoice.payment_succeeded parsed"
        );

        return new BaseWebhookResult({
          status: "SUCCEEDED",
          gatewayTransactionId: invoice.id,
          gatewaySubscriptionId: subscriptionId,
          subscriptionPeriod,
          amount: invoice.amount_paid ?? undefined,
          currency: invoice.currency ?? undefined,
          rawData: invoice,
          isSubscription: true,
        });
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        // 新版 Stripe SDK: subscription 字段移到 parent.subscription_details.subscription
        const subscriptionId = extractSubscriptionIdFromInvoice(invoice);

        logger.info(
          {
            id: invoice.id,
            subscriptionId,
            billingReason: invoice.billing_reason,
            amountDue: invoice.amount_due,
            currency: invoice.currency,
          },
          "Stripe invoice.payment_failed parsed"
        );

        return new BaseWebhookResult({
          status: "FAILED",
          gatewayTransactionId: invoice.id,
          gatewaySubscriptionId: subscriptionId,
          subscriptionPeriod: 0,
          amount: invoice.amount_due ?? undefined,
          currency: invoice.currency ?? undefined,
          rawData: invoice,
          isSubscription: true,
        });
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = stripeSubscriptionSchema.parse(event.data.object);
        logger.info(
          { id: sub.id, status: sub.status },
          "Stripe subscription parsed"
        );

        // 订阅状态映射：
        // - trialing/active -> SUCCEEDED（订阅有效/试用期）
        // - canceled -> EXPIRED（订阅已取消）
        // - 其余 -> FAILED（用于 PAST_DUE 等标记）
        const normalizedStatus =
          sub.status === "active" || sub.status === "trialing"
            ? "SUCCEEDED"
            : sub.status === "canceled"
              ? "EXPIRED"
              : "FAILED";

        const cancelAt = typeof sub.cancel_at === "number" ? new Date(sub.cancel_at * 1000) : null;
        const canceledAt = typeof sub.canceled_at === "number" ? new Date(sub.canceled_at * 1000) : null;
        const endedAt = typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000) : null;
        const cancelAtPeriodEnd =
          sub.cancel_at_period_end === true || cancelAt != null;

        const normalizedData: NormalizedSubscriptionWebhookData = {
          cancelAtPeriodEnd,
          cancelAt,
          canceledAt,
          endedAt,
        };

        return new BaseWebhookResult({
          status: normalizedStatus,
          gatewaySubscriptionId: sub.id,
          rawData: sub,
          isSubscription: true,
          normalizedData,
        });
      }
      case "customer.subscription.deleted": {
        const sub = stripeSubscriptionSchema.parse(event.data.object);
        logger.info(
          { id: sub.id, status: sub.status },
          "Stripe subscription deleted parsed"
        );

        const cancelAt = typeof sub.cancel_at === "number" ? new Date(sub.cancel_at * 1000) : null;
        const canceledAt = typeof sub.canceled_at === "number" ? new Date(sub.canceled_at * 1000) : null;
        const endedAt = typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000) : null;
        const cancelAtPeriodEnd =
          sub.cancel_at_period_end === true || cancelAt != null;

        const normalizedData: NormalizedSubscriptionWebhookData = {
          cancelAtPeriodEnd,
          cancelAt,
          canceledAt,
          endedAt,
        };

        return new BaseWebhookResult({
          status: "EXPIRED",
          gatewaySubscriptionId: sub.id,
          rawData: sub,
          isSubscription: true,
          normalizedData,
        });
      }
      default:
        logger.info({ type: event.type }, "Stripe subscription webhook event ignored");
        return null;
    }
  },
};


