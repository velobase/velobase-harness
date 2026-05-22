import { db } from "@/server/db";
import type { Payment, Prisma } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import { appEvents } from "@/server/events/bus";
import type { WebhookEvent } from "../../providers/types";
import { WebhookFulfillmentError } from "../webhook-pipeline";
import { ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC } from "../../config";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { consumeNewUserUnlockOffer } from "@/server/offers/services/consume-new-user-unlock-offer";
import { recordPaymentTransaction } from "../payment-transactions";

export async function onPaymentSucceeded(event: WebhookEvent, payment: Payment, adapterName: string) {
  const previousStatus = payment.status;

  // Prevent out-of-order/replayed webhooks from downgrading SUCCEEDED
  if (previousStatus === "SUCCEEDED" && event.type === "payment.failed") {
    logger.warn({ paymentId: payment.id, previousStatus }, "Skip downgrading SUCCEEDED payment");
    return { status: "skipped" };
  }

  // Update payment status and backfill gateway IDs
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCEEDED",
      gatewayTransactionId: payment.gatewayTransactionId ?? (event.transactionId ?? undefined),
      gatewaySubscriptionId: payment.gatewaySubscriptionId ?? (event.subscriptionId ?? undefined),
      gatewayResponse: event.raw as Prisma.JsonObject,
    },
  });

  if (!payment.orderId) return { status: "no_order" };

  // Idempotency: if order already fulfilled, skip
  if (previousStatus === "SUCCEEDED") {
    const order = await db.order.findUnique({
      where: { id: payment.orderId },
      select: { status: true, amount: true, userId: true },
    });
    if (order?.status === "FULFILLED") {
      // Backfill UserStats if needed
      try {
        const existingStats = await db.userStats.findUnique({ where: { userId: order.userId }, select: { totalPaidCents: true } });
        if ((existingStats?.totalPaidCents ?? 0) === 0 && order.amount > 0) {
          await db.userStats.upsert({
            where: { userId: order.userId },
            create: { userId: order.userId, totalPaidCents: order.amount, ordersCount: 1, lastPaidAt: new Date() },
            update: { totalPaidCents: { increment: order.amount }, ordersCount: { increment: 1 }, lastPaidAt: new Date() },
          });
        }
      } catch (err) {
        logger.warn({ err, paymentId: payment.id }, "Failed to backfill UserStats (ignored)");
      }
      return { status: "already_fulfilled" };
    }
  }

  // Record cashflow (best-effort)
  try {
    const gateway = adapterName.toUpperCase();
    // For Stripe, cashflow is recorded via charge.succeeded -> cashflow event, skip here.
    if (gateway !== "STRIPE") {
      const externalId = event.transactionId ?? payment.gatewayTransactionId ?? "";
      if (externalId) {
        const orderForKind = await db.order.findUnique({
          where: { id: payment.orderId },
          select: { product: { select: { type: true } } },
        });
        await recordPaymentTransaction({
          userId: payment.userId,
          gateway,
          externalId,
          kind: orderForKind?.product?.type === "SUBSCRIPTION" ? "SUBSCRIPTION_INITIAL_CHARGE" : "ONE_OFF_CHARGE",
          amountCents: payment.amount,
          currency: payment.currency,
          occurredAt: new Date(),
          orderId: payment.orderId,
          paymentId: payment.id,
          gatewaySubscriptionId: payment.gatewaySubscriptionId ?? null,
          sourceEventId: event.providerEventId ?? null,
          sourceEventType: null,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, paymentId: payment.id }, "Failed to record payment transaction (ignored)");
  }

  // Fulfillment
  try {
    await import("@/server/fulfillment/manager").then(m => m.processFulfillmentByPayment(payment));
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FULFILLED" } });
    await db.user.update({ where: { id: payment.userId }, data: { hasPurchased: true } });

    // Auto-sync payment preference
    if (ENABLE_PAYMENT_GATEWAY_PREFERENCE_AUTO_SYNC) {
      const gatewayUpper = adapterName.toUpperCase();
      if (gatewayUpper === "NOWPAYMENTS" || gatewayUpper === "STRIPE") {
        await db.user.updateMany({
          where: { id: payment.userId, paymentGatewayPreference: "AUTO" },
          data: { paymentGatewayPreference: gatewayUpper === "NOWPAYMENTS" ? "NOWPAYMENTS" : "TELEGRAM_STARS" },
        }).catch(() => undefined);
      }
    }

    await appEvents.emit("payment:succeeded", {
      paymentId: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      gateway: adapterName,
      amountCents: payment.amount,
      currency: payment.currency,
      productType: "UNKNOWN",
    });

    // Skip queue logic
    try {
      const extra = payment.extra as unknown;
      const metadata = extra && typeof extra === "object" && "metadata" in (extra as Record<string, unknown>)
        ? ((extra as { metadata?: Record<string, unknown> }).metadata ?? undefined) : undefined;
      if (metadata?.source === "skip_queue") {
        logger.info({ userId: payment.userId, paymentId: payment.id }, "Skip queue payment succeeded");
      }
    } catch { /* ignored */ }

    // UserStats & offer consumption
    const order = await db.order.findUnique({
      where: { id: payment.orderId },
      include: { product: { include: { creditsPackage: true } } },
    });
    if (order) {
      const now = new Date();
      if (order.productId === NEW_USER_UNLOCK_OFFER.discountedProductId) {
        await consumeNewUserUnlockOffer({ userId: order.userId, consumedAt: now });
      }
      await db.userStats.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId, totalPaidCents: order.amount, ordersCount: 1, firstPaidAt: now, lastPaidAt: now },
        update: { totalPaidCents: { increment: order.amount }, ordersCount: { increment: 1 }, lastPaidAt: now },
      });
    }
  } catch (err) {
    logger.error({ err, paymentId: payment.id, orderId: payment.orderId }, "Fulfillment failed");
    throw new WebhookFulfillmentError(err);
  }

  return { status: "fulfilled" };
}
