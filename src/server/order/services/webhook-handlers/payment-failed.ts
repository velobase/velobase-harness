import { db } from "@/server/db";
import type { Payment, Prisma } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import type { WebhookEvent } from "../../providers/types";
import { asyncSendPaymentNotification } from "@/lib/lark";

export async function onPaymentFailed(event: WebhookEvent, payment: Payment, adapterName: string) {
  const previousStatus = payment.status;

  // Never downgrade SUCCEEDED -> FAILED
  if (previousStatus === "SUCCEEDED") {
    logger.warn({ paymentId: payment.id, adapter: adapterName }, "Skip downgrading SUCCEEDED to FAILED");
    return { status: "skipped" };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      gatewayTransactionId: payment.gatewayTransactionId ?? (event.transactionId ?? undefined),
      gatewaySubscriptionId: payment.gatewaySubscriptionId ?? (event.subscriptionId ?? undefined),
      gatewayResponse: event.raw as Prisma.JsonObject,
    },
  });

  if (!payment.orderId) return { status: "updated" };

  // Fail sibling pending payments
  await db.payment.updateMany({
    where: { orderId: payment.orderId, status: "PENDING", id: { not: payment.id } },
    data: { status: "FAILED" },
  });

  // Cancel order if still pending
  const order = await db.order.findUnique({
    where: { id: payment.orderId },
    include: { product: true, user: { include: { referredBy: { select: { name: true, email: true } } } } },
  });

  if (order?.status === "PENDING") {
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  }

  // Best-effort notification
  if (order) {
    try {
      const utm = {
        source: order.user?.utmSource ?? undefined,
        medium: order.user?.utmMedium ?? undefined,
        campaign: order.user?.utmCampaign ?? undefined,
      };
      asyncSendPaymentNotification({
        userName: order.user?.name ?? order.user?.email ?? order.userId,
        userEmail: order.user?.email ?? undefined,
        userCountryCode: order.user?.countryCode ?? undefined,
        amountCents: order.amount,
        currency: order.currency,
        productName: order.product?.name ?? "Unknown Product",
        orderId: order.id,
        paymentId: payment.id,
        gatewayTransactionId: event.transactionId ?? payment.gatewayTransactionId ?? undefined,
        gatewaySubscriptionId: event.subscriptionId ?? payment.gatewaySubscriptionId ?? undefined,
        paymentUrl: payment.paymentUrl ?? undefined,
        gateway:
          adapterName.toUpperCase() === "STRIPE" ? "stripe"
            : adapterName.toUpperCase() === "NOWPAYMENTS" ? "nowpayments" : "other",
        status: "failed",
        isTest: process.env.NODE_ENV !== "production",
        utm,
        originalAmountCents: order.product?.originalPrice,
        referredBy: order.user?.referredBy
          ? { name: order.user.referredBy.name ?? undefined, email: order.user.referredBy.email ?? undefined }
          : undefined,
      });
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, "Failed to send payment failed notification");
    }
  }

  return { status: "failed" };
}
