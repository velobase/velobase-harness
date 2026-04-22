import { db } from "@/server/db";
import { getNowPaymentsPaymentStatus } from "../providers/nowpayments";
import { processFulfillmentByPayment } from "@/server/fulfillment/manager";
import { ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC } from "../config";

export async function getPayment(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  // For NOWPAYMENTS, refresh provider status to drive UI (confirming/confirmed/sending, etc.)
  try {
    if ((payment.paymentGateway ?? "").toUpperCase() === "NOWPAYMENTS" && payment.status === "PENDING") {
      const extra = payment.extra && typeof payment.extra === "object" ? (payment.extra as Record<string, unknown>) : {};
      const np = extra.nowpayments && typeof extra.nowpayments === "object" ? (extra.nowpayments as Record<string, unknown>) : {};
      const npPaymentId =
        typeof np.payment_id === "string" || typeof np.payment_id === "number"
          ? String(np.payment_id)
          : typeof payment.gatewayTransactionId === "string" && payment.gatewayTransactionId.length > 0
            ? payment.gatewayTransactionId
            : null;

      if (npPaymentId) {
        const status = await getNowPaymentsPaymentStatus(npPaymentId);

        const npStatus = (status.payment_status ?? "").toLowerCase();
        const mappedPaymentStatus =
          npStatus === "finished"
            ? ("SUCCEEDED" as const)
            : npStatus === "failed"
              ? ("FAILED" as const)
              : npStatus === "expired"
                ? ("EXPIRED" as const)
                : npStatus === "refunded"
                  ? ("REFUNDED" as const)
                  : ("PENDING" as const);

        const mergedExtra = {
          ...extra,
          nowpayments: {
            ...np,
            payment_id: String(status.payment_id),
            payment_status: status.payment_status,
            pay_address: status.pay_address ?? np.pay_address,
            pay_amount: typeof status.pay_amount === "string" ? Number(status.pay_amount) : status.pay_amount ?? np.pay_amount,
            pay_currency: status.pay_currency ?? np.pay_currency,
            actually_paid: typeof status.actually_paid === "string" ? Number(status.actually_paid) : status.actually_paid,
            payin_hash: status.payin_hash ?? undefined,
            payout_hash: status.payout_hash ?? undefined,
            updated_at: status.updated_at ?? undefined,
          },
        };

        // Persist refreshed extra
        await db.payment
          .update({
            where: { id: payment.id },
            data: { extra: mergedExtra as object },
          })
          .catch(() => undefined);

        // If webhook is missing, proactively sync terminal status and fulfill (idempotently)
        if (mappedPaymentStatus !== "PENDING") {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: mappedPaymentStatus },
          });

          if (mappedPaymentStatus === "SUCCEEDED" && payment.orderId) {
            const order = await db.order.findUnique({
              where: { id: payment.orderId },
              select: { status: true },
            });

            if (order?.status !== "FULFILLED") {
              await processFulfillmentByPayment(payment);
              await db.order.update({
                where: { id: payment.orderId },
                data: { status: "FULFILLED" },
              });
              await db.user.update({
                where: { id: payment.userId },
                data: { hasPurchased: true },
              });

              // Optional: sync default payment preference after success (AUTO -> gateway).
              if (ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC) {
                await db.user.updateMany({
                  where: { id: payment.userId, paymentGatewayPreference: "AUTO" },
                  data: { paymentGatewayPreference: "NOWPAYMENTS" },
                });
              }
            }
          } else if (payment.orderId) {
            // If payment failed/expired/refunded while order still pending, cancel the order to avoid re-use.
            await db.order.updateMany({
              where: { id: payment.orderId, status: "PENDING" },
              data: { status: "CANCELLED" },
            });
          }
        }

        // Return the refreshed view
        (payment as unknown as { extra: object }).extra = mergedExtra as object;
      }
    }
  } catch {
    // ignore provider refresh failures; return DB state
  }

  return payment;
}

