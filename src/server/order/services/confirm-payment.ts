import { db } from "@/server/db";
import { processFulfillmentByPayment } from "@/server/fulfillment/manager";
import { logger } from "@/server/shared/telemetry/logger";
import { getAdapter } from "../providers/registry";
import { sendOrderPaymentNotificationByPaymentId } from "./send-order-payment-notification";

export type ConfirmPaymentResult =
  | { status: "SUCCEEDED"; paymentId: string; orderId: string }
  | { status: "PENDING"; paymentId: string; orderId: string }
  | { status: "FAILED"; paymentId: string; orderId: string };

function getCheckoutId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const e = extra as Record<string, unknown>;
  if (typeof e.gatewayCheckoutId === "string" && e.gatewayCheckoutId.length > 0) return e.gatewayCheckoutId;
  const stripe = e.stripe as Record<string, unknown> | undefined;
  if (stripe && typeof stripe.checkoutSessionId === "string" && stripe.checkoutSessionId.length > 0) return stripe.checkoutSessionId;
  return undefined;
}

export async function confirmPaymentById(
  paymentId: string,
  userId: string,
): Promise<ConfirmPaymentResult> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { product: true } } },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.userId !== userId) throw new Error("Unauthorized");
  if (!payment.orderId || !payment.order) throw new Error("Order not found for payment");

  const orderId = payment.orderId;

  // Already fulfilled — idempotent
  if (payment.order.status === "FULFILLED" && payment.status === "SUCCEEDED") {
    return { status: "SUCCEEDED", paymentId, orderId };
  }

  // Payment succeeded but order not fulfilled — trigger fulfillment
  if (payment.status === "SUCCEEDED" && payment.order.status !== "FULFILLED") {
    logger.warn({ paymentId, orderId }, "Payment SUCCEEDED but order not FULFILLED, triggering fulfillment");
    await processFulfillmentByPayment(payment);
    await db.order.update({ where: { id: orderId }, data: { status: "FULFILLED" } });
    await db.user.update({ where: { id: userId }, data: { hasPurchased: true } });
    setImmediate(() => {
      void sendOrderPaymentNotificationByPaymentId(paymentId, { source: "confirm" });
    });
    return { status: "SUCCEEDED", paymentId, orderId };
  }

  // Active confirmation via adapter
  const gateway = (payment.paymentGateway ?? "").toUpperCase();
  let adapter;
  try {
    adapter = getAdapter(gateway);
  } catch {
    return { status: payment.status === "FAILED" ? "FAILED" : "PENDING", paymentId, orderId };
  }

  if (!adapter.confirmPayment) {
    return { status: "PENDING", paymentId, orderId };
  }

  const checkoutId = getCheckoutId(payment.extra);
  const queryId = checkoutId ?? payment.gatewayTransactionId ?? undefined;
  if (!queryId) {
    return { status: "PENDING", paymentId, orderId };
  }

  let confirmed: { paid: boolean; transactionId?: string; subscriptionId?: string } | undefined;
  try {
    confirmed = await adapter.confirmPayment(queryId);
  } catch (error) {
    logger.warn({ paymentId, orderId, gateway, error }, "ConfirmPayment: adapter confirm failed");
  }

  if (!confirmed?.paid) {
    return { status: "PENDING", paymentId, orderId };
  }

  // Backfill gateway IDs
  if (confirmed.transactionId || confirmed.subscriptionId) {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        gatewayTransactionId: payment.gatewayTransactionId ?? confirmed.transactionId,
        gatewaySubscriptionId: payment.gatewaySubscriptionId ?? confirmed.subscriptionId,
      },
    });
  }

  // Mark succeeded and fulfill
  await db.payment.update({ where: { id: paymentId }, data: { status: "SUCCEEDED" } });
  await processFulfillmentByPayment({ ...payment, status: "SUCCEEDED" } as typeof payment);
  await db.order.update({ where: { id: orderId }, data: { status: "FULFILLED" } });
  await db.user.update({ where: { id: userId }, data: { hasPurchased: true } });

  setImmediate(() => {
    void sendOrderPaymentNotificationByPaymentId(paymentId, { source: "confirm" });
  });

  // Best-effort cashflow record (non-Stripe)
  try {
    if (gateway !== "STRIPE") {
      const externalId = confirmed.transactionId ?? payment.gatewayTransactionId ?? "";
      if (externalId) {
        const { recordPaymentTransaction } = await import("@/server/order/services/payment-transactions");
        const kind = payment.order?.product?.type === "SUBSCRIPTION" ? "SUBSCRIPTION_INITIAL_CHARGE" : "ONE_OFF_CHARGE";
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
    logger.warn({ error, paymentId, orderId }, "Failed to record payment transaction (confirm-payment, ignored)");
  }

  return { status: "SUCCEEDED", paymentId, orderId };
}
