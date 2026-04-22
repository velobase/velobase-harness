/**
 * Order Compensation Processor
 * 
 * 检查 PENDING 状态的支付，通过支付网关 API 确认实际状态（Stripe / NowPayments）
 * 如果网关显示已支付但本地未处理，则触发补偿履约
 */
import type { Job } from "bullmq";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { getNowPaymentsPaymentStatus } from "@/server/order/providers/nowpayments";
import { sendOrderPaymentNotificationByPaymentId } from "@/server/order/services/send-order-payment-notification";
import { appEvents } from "@/server/events/bus";
import { getStripe } from "@/server/order/services/stripe/client";
import type { OrderCompensationJobData } from "../../queues/order-compensation.queue";

const logger = createLogger("order-compensation");

function mapNowPaymentsTerminalStatus(status: string | null | undefined):
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED" {
  const s = (status ?? "").toLowerCase();
  if (s === "finished") return "SUCCEEDED";
  if (s === "failed") return "FAILED";
  if (s === "expired") return "EXPIRED";
  if (s === "refunded") return "REFUNDED";
  return "PENDING";
}

export async function processOrderCompensationJob(
  job: Job<OrderCompensationJobData>
): Promise<void> {
  const { type, paymentId } = job.data;

  if (type === "scheduled-scan") {
    await scanAndCompensatePendingPayments();
  } else if (type === "manual-check" && paymentId) {
    await compensatePayment(paymentId);
  }
}

/**
 * 扫描并补偿所有超时的 PENDING 支付
 */
async function scanAndCompensatePendingPayments(): Promise<void> {
  // 查找超过 5 分钟的 PENDING 支付
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const pendingPayments = await db.payment.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: fiveMinutesAgo },
      paymentGateway: { in: ["STRIPE", "NOWPAYMENTS"] },
      deletedAt: null,
    },
    include: {
      order: {
        include: {
          product: {
            include: { creditsPackage: true },
          },
        },
      },
    },
    take: 50, // 每次最多处理 50 个
  });

  if (pendingPayments.length === 0) {
    logger.info("No pending payments to compensate");
    return;
  }

  logger.info({ count: pendingPayments.length }, "Found pending payments to check");

  for (const payment of pendingPayments) {
    try {
      await checkAndCompensatePayment(payment);
    } catch (error) {
      logger.error(
        { paymentId: payment.id, error },
        "Failed to compensate payment"
      );
    }
  }
}

/**
 * 补偿单个支付
 */
async function compensatePayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          product: {
            include: { creditsPackage: true },
          },
        },
      },
    },
  });

  if (!payment) {
    logger.warn({ paymentId }, "Payment not found");
    return;
  }

  if (payment.status !== "PENDING") {
    logger.info({ paymentId, status: payment.status }, "Payment already processed");
    return;
  }

  await checkAndCompensatePayment(payment);
}

/**
 * 检查 Stripe 支付状态并补偿
 */
async function checkAndCompensatePayment(
  payment: Awaited<ReturnType<typeof db.payment.findUnique>> & {
    order:
      | ({
          status: string;
          expiresAt: Date;
          product: { creditsPackage: { creditsAmount: number } | null } | null;
        } & Record<string, unknown>)
      | null;
  }
): Promise<void> {
  if (!payment) return;

  const gateway = (payment.paymentGateway ?? "").toUpperCase();

  if (gateway === "STRIPE") {
    await checkAndCompensateStripePayment(payment);
    return;
  }
  if (gateway === "NOWPAYMENTS") {
    await checkAndCompensateNowPaymentsPayment(payment);
    return;
  }

  logger.info({ paymentId: payment.id, gateway }, "Skip compensation: unsupported gateway");
}

/**
 * 检查 Stripe 支付状态并补偿
 */
async function checkAndCompensateStripePayment(
  payment: Awaited<ReturnType<typeof db.payment.findUnique>> & {
    order:
      | ({
          status: string;
          expiresAt: Date;
          product: { creditsPackage: { creditsAmount: number } | null } | null;
        } & Record<string, unknown>)
      | null;
  }
): Promise<void> {
  const { gatewayTransactionId, gatewaySubscriptionId } = payment;

  // 从 extra 中解析出 Stripe Checkout Session ID（cs_...）
  const extra = payment.extra as
    | { stripe?: { checkoutSessionId?: string | null } }
    | null
    | undefined;
  const checkoutSessionId =
    typeof extra?.stripe?.checkoutSessionId === "string"
      ? extra.stripe.checkoutSessionId
      : undefined;

  logger.info(
    { paymentId: payment.id, gatewayTransactionId, gatewaySubscriptionId, checkoutSessionId },
    "Checking payment status from Stripe"
  );

  let isPaid = false;
  let paymentIntentId = gatewayTransactionId ?? undefined;

  // 如果还没有 PaymentIntent ID，但有 Checkout Session ID，则先通过 Session 查询
  if (!paymentIntentId && checkoutSessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId);
      isPaid = session.payment_status === "paid" && typeof session.payment_intent === "string";

      logger.info(
        {
          paymentId: payment.id,
          checkoutSessionId,
          paymentStatus: session.payment_status,
          paymentIntent: session.payment_intent,
        },
        "Checkout session status"
      );

      // 如果 Session 已支付且拿到了 PaymentIntent ID，则补齐 gatewayTransactionId
      if (isPaid && typeof session.payment_intent === "string") {
        paymentIntentId = session.payment_intent;
        await db.payment.update({
          where: { id: payment.id },
          data: { gatewayTransactionId: paymentIntentId },
        });
      }
    } catch (error) {
      logger.warn(
        { paymentId: payment.id, checkoutSessionId, error },
        "Failed to retrieve checkout session"
      );
    }
  }

  // 检查 payment intent
  if (!isPaid && paymentIntentId) {
    try {
      const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      isPaid = paymentIntent.status === "succeeded";
      logger.info(
        { paymentId: payment.id, paymentIntentId, status: paymentIntent.status },
        "Payment intent status"
      );
    } catch (error) {
      logger.warn({ paymentId: payment.id, error }, "Failed to retrieve payment intent");
    }
  }

  if (isPaid) {
    logger.info({ paymentId: payment.id }, "Payment confirmed as paid, triggering fulfillment");
    await triggerFulfillment(payment);
  } else {
    // 过期判定：必须使用 payment.expiresAt（避免定时任务时间差导致误取消）
    const now = new Date();
    if (payment.expiresAt > now) return;

    logger.info(
      { paymentId: payment.id, expiresAt: payment.expiresAt },
      "Payment expired, marking payment as FAILED"
    );

    // 只处理仍为 PENDING 的 payment（幂等）
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    // 安全策略：不要因为“某一笔 payment 过期/失败”就取消整个订单。
    // 只有当满足以下条件才允许取消订单：
    // - 订单仍是 PENDING
    // - 订单已过期（order.expiresAt <= now）
    // - 该订单下不存在任何 SUCCEEDED payment（否则会把已支付订单误取消）
    if (!payment.orderId) return;
    const order = payment.order;
    if (!order) return;
    if (order.status !== "PENDING") return;
    if (order.expiresAt > now) return;

    const succeeded = await db.payment.findFirst({
      where: {
        orderId: payment.orderId,
        status: "SUCCEEDED",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (succeeded) {
      logger.warn(
        { orderId: payment.orderId, paymentId: payment.id, succeededPaymentId: succeeded.id },
        "Skip cancelling order because a SUCCEEDED payment exists"
      );
      return;
    }

    await db.order.update({
      where: { id: payment.orderId },
      data: { status: "CANCELLED" },
    });
  }
}

/**
 * 检查 NowPayments 支付状态并补偿（通过查询接口，不依赖 webhook）
 */
async function checkAndCompensateNowPaymentsPayment(
  payment: Awaited<ReturnType<typeof db.payment.findUnique>> & {
    order:
      | ({
          status: string;
          expiresAt: Date;
          product: { creditsPackage: { creditsAmount: number } | null } | null;
        } & Record<string, unknown>)
      | null;
  }
): Promise<void> {
  // 从 extra.nowpayments.payment_id 或 gatewayTransactionId 取 NowPayments payment_id
  const extra = payment.extra && typeof payment.extra === "object" ? (payment.extra as Record<string, unknown>) : {};
  const np = extra.nowpayments && typeof extra.nowpayments === "object" ? (extra.nowpayments as Record<string, unknown>) : {};
  const npPaymentId =
    typeof np.payment_id === "string" || typeof np.payment_id === "number"
      ? String(np.payment_id)
      : typeof payment.gatewayTransactionId === "string" && payment.gatewayTransactionId.length > 0
        ? payment.gatewayTransactionId
        : null;

  if (!npPaymentId) {
    logger.warn({ paymentId: payment.id }, "NowPayments payment_id missing; skip compensation");
    return;
  }

  logger.info({ paymentId: payment.id, npPaymentId }, "Checking payment status from NowPayments");

  let providerStatus: Awaited<ReturnType<typeof getNowPaymentsPaymentStatus>> | null = null;
  try {
    providerStatus = await getNowPaymentsPaymentStatus(npPaymentId);
  } catch (error) {
    logger.warn({ paymentId: payment.id, npPaymentId, error }, "Failed to fetch NowPayments status");
    return;
  }

  const mapped = mapNowPaymentsTerminalStatus(providerStatus.payment_status);
  if (mapped === "PENDING") {
    return;
  }

  // Terminal: update payment status + attach provider payload for audit
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: mapped,
      gatewayTransactionId: payment.gatewayTransactionId ?? npPaymentId,
      gatewayResponse: JSON.parse(JSON.stringify(providerStatus)) as object,
    },
  });

  if (mapped === "SUCCEEDED") {
    logger.info({ paymentId: payment.id }, "NowPayments confirmed as finished, triggering fulfillment");
    await triggerFulfillment(payment);
  } else {
    logger.info({ paymentId: payment.id, status: mapped }, "NowPayments terminal status, no fulfillment");
  }
}

/**
 * 触发履约
 */
async function triggerFulfillment(
  payment: NonNullable<Awaited<ReturnType<typeof db.payment.findUnique>>>
): Promise<void> {
  try {
    // 更新支付状态
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED" },
    });

    // 调用履约逻辑
    const { processFulfillmentByPayment } = await import(
      "@/server/fulfillment/manager"
    );
    await processFulfillmentByPayment(payment);

    // 更新订单状态
    if (payment.orderId) {
      await db.order.update({
        where: { id: payment.orderId },
        data: { status: "FULFILLED" },
      });

      // 与 webhook / get-payment 等路径保持一致：标记用户已购买（用于免费额度风控豁免等）
      await db.user.update({
        where: { id: payment.userId },
        data: { hasPurchased: true },
      });

      await appEvents.emit("payment:succeeded", {
        paymentId: payment.id,
        orderId: payment.orderId,
        userId: payment.userId,
        gateway: (payment.paymentGateway ?? "unknown").toLowerCase(),
        amountCents: payment.amount,
        currency: payment.currency,
        productType: "UNKNOWN",
      });
    }

    logger.info(
      { paymentId: payment.id, orderId: payment.orderId },
      "✅ Fulfillment completed via compensation"
    );

    // 支付成功通知（Lark/飞书）- 异步 best-effort
    setImmediate(() => {
      void sendOrderPaymentNotificationByPaymentId(payment.id, { source: "compensation" });
    });
  } catch (error) {
    logger.error({ paymentId: payment.id, error }, "Fulfillment failed");
    throw error;
  }
}

