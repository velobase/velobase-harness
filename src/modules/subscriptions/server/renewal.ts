import type { StripePaidSubscriptionInvoice } from "@velobase/subscriptions-stripe";
import { SubscriptionsError } from "@velobase/subscriptions";
import { db } from "@/server/db";
import { appEvents } from "@/server/events/bus";
import {
  subscriptionDeliveries,
  deliverSubscriptionEffect,
  prepareDeliveryCycle,
  recordFirstCreditAnchor,
} from "./delivery";
import {
  subscriptionProductSchema,
  savedPeriodContextSchema,
  creditEffect,
  addMonths,
} from "./fulfillment-plan";

/** The complete example explicitly selects a credit consumer. The independent subscription
 * package records period delivery without importing this host's credits, stats or event bus. */
export async function fulfillStripeSubscriptionRenewal(
  invoice: StripePaidSubscriptionInvoice,
) {
  const subscription = await db.userSubscription.findFirst({
    where: {
      gateway: { equals: "STRIPE", mode: "insensitive" },
      gatewaySubscriptionId: invoice.gatewaySubscriptionId,
      deletedAt: null,
    },
  });
  if (!subscription)
    throw new SubscriptionsError(
      "NOT_FOUND",
      "Invoice subscription is not enrolled yet",
    );
  const record = await subscriptionDeliveries.settle(
    {
      key: `sub_renewal_${subscription.id}_${invoice.invoiceId}`,
      userId: subscription.userId,
      subscriptionId: subscription.id,
    },
    async (tx) => {
      const current = await tx.userSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      const product = subscriptionProductSchema.parse(current.planSnapshot);
      const plan = product.productSubscription.plan;
      const credits = plan.creditsPerPeriod ?? plan.creditsPerMonth ?? 0;
      const cycle = await prepareDeliveryCycle(tx, {
        subscriptionId: subscription.id,
        uniqueKey: `sub_renewal_${subscription.id}_${invoice.invoiceId}`,
        type: "REGULAR",
        startsAt: invoice.periodStart,
        expiresAt: invoice.periodEnd,
      });
      // Only superseded periods close. An old invoice cannot close a later paid period or clear cancellation.
      await tx.userSubscriptionCycle.updateMany({
        where: {
          subscriptionId: subscription.id,
          id: { not: cycle.id },
          status: "ACTIVE",
          deletedAt: null,
          startsAt: { lt: cycle.startsAt },
          OR: [{ expiresAt: { lte: cycle.startsAt } }, { type: "TRIAL" }],
        },
        data: { status: "CLOSED" },
      });
      return {
        cycleId: cycle.id,
        context: {
          kind: "renewal",
          startsAt: cycle.startsAt.toISOString(),
          expiresAt: cycle.expiresAt.toISOString(),
          cycleNumber: cycle.sequenceNumber,
          trial: false,
          hasCredits: credits > 0,
          amountCents: invoice.amountPaid,
          currency: invoice.currency,
          invoiceId: invoice.invoiceId,
          productSnapshot: current.planSnapshot,
        },
        effects:
          credits > 0
            ? [
                creditEffect({
                  userId: subscription.userId,
                  key: `subscription_renewal_${subscription.id}_${invoice.invoiceId}`,
                  amount: credits,
                  referenceId: subscription.id,
                  description: "Subscription Credits (renewal first month)",
                  startsAt: cycle.startsAt,
                  expiresAt: addMonths(cycle.startsAt, 1),
                }),
              ]
            : [],
      };
    },
    deliverSubscriptionEffect,
  );
  const period = savedPeriodContextSchema.parse(record.plan.context);
  if (period.hasCredits) {
    await recordFirstCreditAnchor(
      record.plan.cycleId,
      new Date(period.startsAt),
    );
    await db.userStats.updateMany({
      where: {
        userId: subscription.userId,
        hasUsedProTrial: true,
        proTrialConverted: false,
      },
      data: { proTrialConverted: true },
    });
  }
  await appEvents.emit("subscription:cycle-created", {
    userId: subscription.userId,
    subscriptionId: subscription.id,
    cycleId: record.plan.cycleId,
  });
  await appEvents.emit("subscription:renewed", {
    invoiceId: invoice.invoiceId,
    subscriptionId: subscription.id,
    userId: subscription.userId,
    cycleNumber: period.cycleNumber,
    amountCents: invoice.amountPaid,
    currency: invoice.currency,
    periodStart: new Date(period.startsAt),
    periodEnd: new Date(period.expiresAt),
  });
  return { subscription, period, record };
}
