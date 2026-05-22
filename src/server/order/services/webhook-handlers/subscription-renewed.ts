import { db } from "@/server/db";
import { logger } from "@/server/shared/telemetry/logger";
import { appEvents } from "@/server/events/bus";
import { grant } from "@/server/billing/services/grant";
import { createSubscriptionCycle } from "@/server/membership/services/create-subscription-cycle";
import { recordPaymentTransaction } from "../payment-transactions";
import { asyncSendPaymentNotification } from "@/lib/lark";
import type { WebhookEvent } from "../../providers/types";
import { WebhookFulfillmentError } from "../webhook-pipeline";

export async function onSubscriptionRenewed(event: WebhookEvent, adapterName: string) {
  const gatewaySubId = event.subscriptionId;
  const txnId = event.transactionId;

  if (!gatewaySubId) {
    logger.error({ adapter: adapterName }, "Subscription renewal missing gateway subscription id");
    return { status: "ignored" };
  }
  if (!txnId) {
    logger.error({ adapter: adapterName }, "Subscription renewal missing transaction id");
    return { status: "ignored" };
  }

  const subscription = await db.userSubscription.findFirst({
    where: { gatewaySubscriptionId: gatewaySubId },
    include: {
      cycles: { where: { status: "ACTIVE" }, orderBy: { sequenceNumber: "desc" }, take: 1 },
    },
  });

  if (!subscription) {
    logger.error({ gatewaySubscriptionId: gatewaySubId }, "UserSubscription not found for renewal");
    return { status: "ignored" };
  }

  // Cashflow recording for non-Stripe providers
  if (adapterName.toUpperCase() !== "STRIPE") {
    try {
      const amountCents = event.amount ?? 0;
      if (amountCents > 0) {
        await recordPaymentTransaction({
          userId: subscription.userId,
          gateway: adapterName.toUpperCase(),
          externalId: txnId,
          kind: "SUBSCRIPTION_RENEWAL_CHARGE",
          amountCents,
          currency: event.currency ?? "usd",
          occurredAt: new Date(),
          orderId: null,
          paymentId: null,
          gatewaySubscriptionId: gatewaySubId,
          gatewayInvoiceId: txnId,
          sourceEventId: event.providerEventId ?? null,
          sourceEventType: "subscription_renewal",
        });
      }
    } catch (error) {
      logger.warn({ error, adapter: adapterName, txnId }, "Failed to record renewal transaction (ignored)");
    }
  }

  const activeCycle = subscription.cycles[0] ?? null;

  const snapshot = subscription.planSnapshot as unknown as {
    productSubscription?: {
      plan?: { interval?: string; intervalCount?: number; creditsPerPeriod?: number; creditsPerMonth?: number };
    };
  };

  const plan = snapshot.productSubscription?.plan;
  if (!plan) {
    logger.warn({ subscriptionId: subscription.id }, "Subscription plan snapshot missing");
    return { status: "ignored" };
  }

  const rawInterval = (plan.interval ?? "").toString().toLowerCase();
  const interval = rawInterval === "week" || rawInterval === "month" || rawInterval === "year" ? rawInterval : "";
  const intervalCount = typeof plan.intervalCount === "number" && plan.intervalCount > 0 ? plan.intervalCount : 1;

  if (!interval) {
    logger.warn({ subscriptionId: subscription.id, rawInterval }, "Unsupported subscription interval");
    return { status: "ignored" };
  }

  const now = new Date();
  let periodStart = activeCycle?.expiresAt ?? now;
  if (activeCycle?.type === "TRIAL" && activeCycle.expiresAt > now) periodStart = now;

  const periodEnd = new Date(periodStart);
  if (interval === "week") periodEnd.setDate(periodEnd.getDate() + 7 * intervalCount);
  else if (interval === "month") periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
  else periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);

  const creditsPerPeriod =
    (typeof plan.creditsPerPeriod === "number" && plan.creditsPerPeriod > 0) ? plan.creditsPerPeriod
      : (typeof plan.creditsPerMonth === "number" && plan.creditsPerMonth > 0) ? plan.creditsPerMonth : 0;

  let newCycleSequenceNumber: number | undefined;

  try {
    const renewalUniqueKey = `sub_renewal_${subscription.id}_${txnId}`;
    const newCycle = await createSubscriptionCycle({
      subscriptionId: subscription.id,
      paymentId: undefined,
      uniqueKey: renewalUniqueKey,
      type: "REGULAR",
      startsAt: periodStart,
      expiresAt: periodEnd,
    });

    // Idempotency: if cycle was already created (replay), skip
    if (newCycle.createdAt.getTime() < Date.now() - 5000) {
      logger.info({ subscriptionId: subscription.id, txnId }, "Subscription renewal already processed (cycle exists)");
      return { status: "already_processed" };
    }

    newCycleSequenceNumber = newCycle.sequenceNumber;

    // Close old active cycle
    if (activeCycle && activeCycle.id !== newCycle.id) {
      await db.userSubscriptionCycle.update({ where: { id: activeCycle.id }, data: { status: "CLOSED" } });
    }

    // Restore subscription to ACTIVE
    await db.userSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", cancelAtPeriodEnd: false, canceledAt: null, endedAt: null },
    });

    // Grant credits
    if (creditsPerPeriod > 0) {
      const firstMonthCreditExpiresAt = new Date(periodStart);
      firstMonthCreditExpiresAt.setMonth(firstMonthCreditExpiresAt.getMonth() + 1);

      const outerBizId = `subscription_renewal_${subscription.id}_${txnId}`;
      await grant({
        userId: subscription.userId,
        source: "membership",
        amount: creditsPerPeriod,
        outerBizId,
        businessType: "SUBSCRIPTION",
        referenceId: subscription.id,
        description: "Subscription Credits (renewal first month)",
        startsAt: periodStart,
        expiresAt: firstMonthCreditExpiresAt,
      });

      await db.userSubscriptionCycle.update({
        where: { id: newCycle.id },
        data: { lastCreditGrantAnchor: periodStart },
      });

      // Mark Trial -> subscription conversion
      await db.userStats.updateMany({
        where: { userId: subscription.userId, hasUsedProTrial: true, proTrialConverted: false },
        data: { proTrialConverted: true },
      });
    }

    await appEvents.emit("subscription:renewed", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      cycleNumber: newCycleSequenceNumber,
      amountCents: event.amount ?? 0,
      currency: event.currency ?? "usd",
      periodStart,
      periodEnd,
    });
  } catch (error) {
    logger.error({ error, adapter: adapterName, subscriptionId: subscription.id }, "Subscription renewal fulfillment failed");
    throw new WebhookFulfillmentError(error);
  }

  logger.info({ subscriptionId: subscription.id, periodStart, periodEnd, creditsPerPeriod }, "Subscription renewal processed");

  // Best-effort notification
  try {
    const user = await db.user.findUnique({
      where: { id: subscription.userId },
      select: { id: true, name: true, email: true, countryCode: true, utmSource: true, utmMedium: true, utmCampaign: true, referredBy: { select: { name: true, email: true } } },
    });
    const planSnapshot = subscription.planSnapshot as unknown as { name?: string } | null;
    asyncSendPaymentNotification({
      bizType: "subscription",
      subscriptionEvent: "renewal",
      subscriptionCycleNumber: newCycleSequenceNumber,
      subscriptionPeriodStart: periodStart.toISOString(),
      subscriptionPeriodEnd: periodEnd.toISOString(),
      userName: user?.name ?? user?.email ?? subscription.userId,
      userEmail: user?.email ?? undefined,
      userCountryCode: user?.countryCode ?? undefined,
      amountCents: event.amount ?? 0,
      currency: event.currency ?? "usd",
      productName: planSnapshot?.name ? `${planSnapshot.name} (Renewal)` : "Subscription Renewal",
      orderId: `sub_renewal_${subscription.id}_${txnId}`,
      gateway: adapterName.toUpperCase() === "STRIPE" ? "stripe" : adapterName.toUpperCase() === "NOWPAYMENTS" ? "nowpayments" : "other",
      status: "succeeded",
      isTest: process.env.NODE_ENV !== "production",
      credits: creditsPerPeriod > 0 ? creditsPerPeriod : undefined,
      utm: { source: user?.utmSource ?? undefined, medium: user?.utmMedium ?? undefined, campaign: user?.utmCampaign ?? undefined },
      referredBy: user?.referredBy ? { name: user.referredBy.name ?? undefined, email: user.referredBy.email ?? undefined } : undefined,
    });
  } catch (error) {
    logger.error({ error, subscriptionId: subscription.id }, "Failed to send renewal notification");
  }

  return { status: "renewed" };
}
