import { db } from "@/server/db";
import { processFulfillmentByPayment } from "@/server/fulfillment/manager";
import { logger } from "@/server/shared/telemetry/logger";
import { getProvider } from "../providers/registry";
import { sendOrderPaymentNotificationByPaymentId } from "./send-order-payment-notification";

export type ConfirmPaymentResult =
  | { status: "SUCCEEDED"; paymentId: string; orderId: string }
  | { status: "PENDING"; paymentId: string; orderId: string }
  | { status: "FAILED"; paymentId: string; orderId: string };

function getCheckoutSessionId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const stripeObj = (extra as { stripe?: unknown }).stripe;
  if (!stripeObj || typeof stripeObj !== "object") return undefined;
  const cs = (stripeObj as { checkoutSessionId?: unknown }).checkoutSessionId;
  return typeof cs === "string" && cs.length > 0 ? cs : undefined;
}

function getNowPaymentsPaymentId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const npObj = (extra as { nowpayments?: unknown }).nowpayments;
  if (!npObj || typeof npObj !== "object") return undefined;
  const paymentId = (npObj as { payment_id?: unknown }).payment_id;
  return typeof paymentId === "string" && paymentId.length > 0 ? paymentId : undefined;
}

/**
 * Confirm Stripe payment status by querying Stripe directly (handles webhook delays).
 *
 * Safety:
 * - Only triggers fulfillment when Stripe says "paid/succeeded".
 * - Fulfillment path is made idempotent by paymentId (subscription) and outerBizId (grant).
 */
export async function confirmPaymentById(
  paymentId: string,
  userId: string
): Promise<ConfirmPaymentResult> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { product: true } } },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.userId !== userId) throw new Error("Unauthorized");
  if (!payment.orderId || !payment.order) throw new Error("Order not found for payment");

  const orderId = payment.orderId;

  // If order already fulfilled, we're done (idempotent)
  if (payment.order.status === "FULFILLED" && payment.status === "SUCCEEDED") {
    return { status: "SUCCEEDED", paymentId, orderId };
  }

  // If DB already marks payment succeeded but order isn't fulfilled (e.g. subscription webhook updated payment first),
  // trigger fulfillment idempotently.
  if (payment.status === "SUCCEEDED" && payment.order.status !== "FULFILLED") {
    logger.warn({ paymentId, orderId }, "Payment already SUCCEEDED but order not FULFILLED, triggering fulfillment");
    await processFulfillmentByPayment(payment);
    await db.order.update({ where: { id: orderId }, data: { status: "FULFILLED" } });
    await db.user.update({ where: { id: userId }, data: { hasPurchased: true } });
    setImmediate(() => {
      void sendOrderPaymentNotificationByPaymentId(paymentId, { source: "confirm" });
    });
    return { status: "SUCCEEDED", paymentId, orderId };
  }

  const gateway = payment.paymentGateway?.toUpperCase();
  if (gateway !== "STRIPE" && gateway !== "NOWPAYMENTS") {
    return { status: payment.status === "FAILED" ? "FAILED" : "PENDING", paymentId, orderId };
  }

  let checkoutSessionId: string | undefined;
  let gatewayTxnId: string | undefined =
    typeof payment.gatewayTransactionId === "string" && payment.gatewayTransactionId.length > 0
      ? payment.gatewayTransactionId
      : undefined;

  if (gateway === "STRIPE") {
    checkoutSessionId = getCheckoutSessionId(payment.extra);
  } else if (gateway === "NOWPAYMENTS") {
    // NowPayments uses payment_id as both checkoutSessionId and gatewayTransactionId
    checkoutSessionId = getNowPaymentsPaymentId(payment.extra) ?? gatewayTxnId;
  }

  const provider = getProvider(gateway);
  let confirmed:
    | { isPaid: boolean; gatewayTransactionId?: string; gatewaySubscriptionId?: string }
    | undefined;
  try {
    confirmed = await provider.confirmPayment?.({
      checkoutSessionId,
      gatewayTransactionId: gatewayTxnId,
    });
  } catch (error) {
    logger.warn({ paymentId, orderId, checkoutSessionId, gatewayTxnId, gateway, error }, "ConfirmPayment: provider confirm failed");
  }

  const isPaid = !!confirmed?.isPaid;
  const nextGatewayTransactionId = confirmed?.gatewayTransactionId;
  const nextGatewaySubscriptionId = confirmed?.gatewaySubscriptionId;

  if (nextGatewayTransactionId || nextGatewaySubscriptionId) {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        gatewayTransactionId: payment.gatewayTransactionId ?? nextGatewayTransactionId,
        gatewaySubscriptionId: payment.gatewaySubscriptionId ?? nextGatewaySubscriptionId,
      },
    });
    gatewayTxnId = gatewayTxnId ?? nextGatewayTransactionId;
  }

  if (!isPaid) {
    return { status: "PENDING", paymentId, orderId };
  }

  // Mark payment succeeded and fulfill
  await db.payment.update({ where: { id: paymentId }, data: { status: "SUCCEEDED" } });
  await processFulfillmentByPayment({ ...payment, status: "SUCCEEDED" } as typeof payment);
  await db.order.update({ where: { id: orderId }, data: { status: "FULFILLED" } });
  await db.user.update({ where: { id: userId }, data: { hasPurchased: true } });

  setImmediate(() => {
    void sendOrderPaymentNotificationByPaymentId(paymentId, { source: "confirm" });
  });

  // Append-only cashflow record (best-effort, idempotent).
  // Note: Stripe subscription Checkout may still lack a stable gateway transaction id here.
  try {
    const gateway = (payment.paymentGateway ?? "").toUpperCase();
    const externalId =
      gatewayTxnId ??
      (typeof payment.gatewayTransactionId === "string" ? payment.gatewayTransactionId : undefined);

    if (externalId) {
      // First principles: PaymentTransaction for STRIPE should only be recorded on charge.succeeded.
      // confirmPayment is a polling/fulfillment helper, not a cashflow event.
      // For other gateways, we keep best-effort logging here.
      if (gateway !== "STRIPE") {
        const { recordPaymentTransaction } = await import(
          "@/server/order/services/payment-transactions"
        );
        const kind =
          payment.order?.product?.type === "SUBSCRIPTION"
            ? "SUBSCRIPTION_INITIAL_CHARGE"
            : "ONE_OFF_CHARGE";
        await recordPaymentTransaction({
          userId,
          gateway,
          externalId,
          kind,
          amountCents: payment.amount,
          currency: payment.currency,
          occurredAt: new Date(),
          orderId,
          paymentId,
          gatewaySubscriptionId: payment.gatewaySubscriptionId ?? null,
          sourceEventId: null,
          sourceEventType: "confirm_payment_polling",
        });
      }
    }
  } catch (error) {
    logger.warn(
      { error, paymentId, orderId },
      "Failed to record payment transaction (confirm-payment, ignored)"
    );
  }

  return { status: "SUCCEEDED", paymentId, orderId };
}


