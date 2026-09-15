import { z } from "zod";
import type { Fulfiller, FulfillmentContext } from "../types";
import { createSubscription } from "@/server/membership/services/create-subscription";
import { cancelSubscriptionNow } from "@/server/membership/services/cancel-subscription-now";
import { getProduct } from "@/server/product/services/get";
import { db } from "@/server/db";
import { appEvents } from "@/server/events/bus";
import { createLogger } from "@/lib/logger";
import { jsonValueSchema } from "@velobase/subscriptions";
import type {
  DeliveryEffect,
  PreparedDelivery,
} from "@velobase/subscriptions/delivery";
import {
  subscriptionDeliveries,
  deliverSubscriptionEffect,
  findSubscriptionDelivery,
  prepareDeliveryCycle,
  recordFirstCreditAnchor,
} from "@/modules/subscriptions/server/delivery";
import {
  subscriptionProductSchema,
  savedPeriodContextSchema,
  creditEffect,
  addDays,
  addMonths,
  periodEnd,
} from "@/modules/subscriptions/server/fulfillment-plan";

const log = createLogger("subscription-fulfillment");
const metadataSchema = z
  .object({
    metadata: z
      .object({
        subscriptionUpgrade: z
          .object({ fromSubscriptionId: z.string().min(1) })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

async function finish(record: PreparedDelivery) {
  const context = savedPeriodContextSchema.parse(record.plan.context);
  // Extending an existing manual period preserves its drip cursor and creates no new-cycle event.
  if (context.manualExtension) return;
  if (context.hasCredits)
    await recordFirstCreditAnchor(
      record.plan.cycleId,
      new Date(context.startsAt),
    );
  if (context.trial) {
    await db.userStats.upsert({
      where: { userId: record.userId },
      create: {
        userId: record.userId,
        hasUsedProTrial: true,
        proTrialSource: context.trialSource ?? "download_paywall",
      },
      update: {
        hasUsedProTrial: true,
        proTrialSource: context.trialSource ?? "download_paywall",
      },
    });
  }
  await appEvents.emit("subscription:cycle-created", {
    userId: record.userId,
    subscriptionId: record.subscriptionId,
    cycleId: record.plan.cycleId,
  });
}

export const subscriptionFulfiller: Fulfiller = {
  canHandle: (product) => product.type === "SUBSCRIPTION",
  getName: () => "SubscriptionFulfiller",
  async fulfill(ctx: FulfillmentContext) {
    if (
      ctx.payment.userId !== ctx.order.userId ||
      ctx.payment.orderId !== ctx.order.id
    )
      throw new Error("Payment does not belong to the subscription order");
    const key = `pay_${ctx.payment.id}`;
    // Replays resume the stored plan before consulting mutable catalog data or invoking upgrades.
    const saved = await findSubscriptionDelivery(key, ctx.order.userId);
    if (saved) {
      const delivered = await subscriptionDeliveries.settle(
        saved,
        async () => {
          throw new Error("Stored delivery plan disappeared");
        },
        deliverSubscriptionEffect,
      );
      await finish(delivered);
      return;
    }
    // Existing fulfilled orders predate receipts. Their order status is retained as a legacy completion record.
    if (ctx.order.status === "FULFILLED") return;

    const oldCycle = await db.userSubscriptionCycle.findFirst({
      where: { paymentId: ctx.payment.id, deletedAt: null },
      include: { subscription: true },
    });
    if (
      oldCycle &&
      (oldCycle.subscription.userId !== ctx.order.userId ||
        oldCycle.subscription.gateway.toUpperCase() !==
          ctx.payment.paymentGateway.toUpperCase() ||
        oldCycle.subscription.deletedAt)
    )
      throw new Error(
        "Existing subscription period belongs to a different account or gateway",
      );

    let snapshot = jsonValueSchema.parse(ctx.order.productSnapshot);
    if (!subscriptionProductSchema.safeParse(snapshot).success) {
      // Older orders did not store plan relations. Freeze the retained subscription terms, or the
      // legacy catalog fallback, ONCE in the new receipt; new orders always carry full plan terms.
      const retained = oldCycle?.subscription.planSnapshot;
      const fallback =
        retained && subscriptionProductSchema.safeParse(retained).success
          ? retained
          : JSON.parse(
              JSON.stringify(
                await getProduct({ productId: ctx.order.productId }),
              ),
            );
      const original = ctx.order.productSnapshot;
      snapshot = jsonValueSchema.parse({
        ...fallback,
        ...(original && typeof original === "object" && !Array.isArray(original)
          ? original
          : {}),
        productSubscription: fallback.productSubscription,
      });
      log.warn(
        { orderId: ctx.order.id },
        "Legacy order missing plan terms; freezing retained terms for delivery",
      );
    }
    const product = subscriptionProductSchema.parse(snapshot);
    if (product.id !== ctx.order.productId)
      throw new Error("Subscription snapshot does not match the order");
    const quantity = z
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(ctx.order.quantity);
    const plan = product.productSubscription.plan;
    const credits = plan.creditsPerPeriod ?? plan.creditsPerMonth ?? 0;
    const manual = ctx.payment.paymentGateway.toUpperCase() === "NOWPAYMENTS";
    const sub =
      oldCycle?.subscription ??
      (await createSubscription({
        userId: ctx.order.userId,
        planId: product.productSubscription.planId,
        planSnapshot: snapshot,
        gateway: ctx.payment.paymentGateway,
        gatewaySubscriptionId: ctx.payment.gatewaySubscriptionId ?? undefined,
        cancelAtPeriodEnd: manual,
      }));
    const upgrade = metadataSchema.parse(ctx.payment.extra ?? {}).metadata
      ?.subscriptionUpgrade;
    if (upgrade) {
      if (upgrade.fromSubscriptionId === sub.id)
        throw new Error("Cannot upgrade a subscription to itself");
      await cancelSubscriptionNow({
        subscriptionId: upgrade.fromSubscriptionId,
        userId: ctx.order.userId,
      });
    }
    const delivered = await subscriptionDeliveries.settle(
      { key, userId: sub.userId, subscriptionId: sub.id },
      async (tx) => {
        const now = new Date();
        const prepaid = manual
          ? await tx.userSubscriptionCycle.findFirst({
              where: {
                subscriptionId: sub.id,
                status: "ACTIVE",
                deletedAt: null,
                expiresAt: { gt: now },
              },
              orderBy: { sequenceNumber: "desc" },
            })
          : null;
        const prior = await tx.userSubscriptionCycle.findFirst({
          where: { paymentId: ctx.payment.id, deletedAt: null },
        });
        const manualExtension = Boolean(prepaid && !prior);
        const trial = prior
          ? prior.type === "TRIAL"
          : !prepaid &&
            product.hasTrial &&
            (product.trialDays ?? 0) > 0 &&
            (product.trialCreditsAmount ?? 0) > 0;
        const startsAt = prior?.startsAt ?? prepaid?.expiresAt ?? now;
        const expiresAt =
          prior?.expiresAt ??
          (trial
            ? addDays(startsAt, product.trialDays!)
            : periodEnd(
                startsAt,
                plan.interval,
                plan.intervalCount * quantity,
              ));
        // Preserve manual-renewal policy: extend the current period. The receipt and extension
        // commit together under the subscription lock, so replaying this payment cannot extend twice.
        const cycle =
          prepaid && !prior
            ? await tx.userSubscriptionCycle.update({
                where: { id: prepaid.id },
                data: {
                  expiresAt,
                  lastCreditGrantAnchor: prepaid.lastCreditGrantAnchor ?? now,
                },
              })
            : await prepareDeliveryCycle(tx, {
                subscriptionId: sub.id,
                paymentId: ctx.payment.id,
                uniqueKey: key,
                type: trial ? "TRIAL" : "REGULAR",
                startsAt,
                expiresAt,
              });
        const effects: DeliveryEffect[] = [];
        if (!manualExtension && cycle.type === "TRIAL") {
          if ((product.trialCreditsAmount ?? 0) > 0)
            effects.push(
              creditEffect({
                userId: sub.userId,
                key: `subscription_trial_${cycle.id}`,
                amount: product.trialCreditsAmount!,
                referenceId: cycle.id,
                startsAt: cycle.startsAt,
                expiresAt: cycle.expiresAt,
                trial: true,
                description: `Subscription Trial Credits (${product.trialDays} days)`,
              }),
            );
        } else if (credits > 0) {
          if (plan.interval === "WEEK") {
            for (let i = 0; i < quantity; i++) {
              const start = addDays(startsAt, i * 7 * plan.intervalCount);
              const day = start.toISOString().slice(0, 10);
              effects.push(
                creditEffect({
                  userId: sub.userId,
                  key: `subscription_cycle_${cycle.id}_credits_week_${day}`,
                  amount: credits,
                  referenceId: cycle.id,
                  startsAt: start,
                  expiresAt: addMonths(start, 1),
                  description: `Subscription weekly credits (${day})`,
                }),
              );
            }
          } else if (!manualExtension) {
            const month = cycle.startsAt.toISOString().slice(0, 7);
            effects.push(
              creditEffect({
                userId: sub.userId,
                key: `subscription_cycle_${cycle.id}_credits_${month}`,
                amount: credits,
                referenceId: cycle.id,
                startsAt: cycle.startsAt,
                expiresAt: addMonths(cycle.startsAt, 1),
                description: `Subscription Credits (first month ${month})`,
              }),
            );
          }
        }
        return {
          cycleId: cycle.id,
          context: {
            kind: "initial",
            startsAt: startsAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            cycleNumber: cycle.sequenceNumber,
            trial: !manualExtension && cycle.type === "TRIAL",
            manualExtension,
            trialSource: product.metadata?.useCase ?? "download_paywall",
            hasCredits: effects.length > 0,
            productSnapshot: snapshot,
          },
          effects,
        };
      },
      deliverSubscriptionEffect,
    );
    await finish(delivered);
  },
};
