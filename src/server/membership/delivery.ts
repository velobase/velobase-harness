import { Prisma, type UserSubscriptionCycle } from "@prisma/client";
import { z } from "zod";
import {
  createSubscriptionDeliveries,
  deliveryPlanSchema,
  type DeliveryIdentity,
  type PreparedDelivery,
  type SubscriptionDeliveryRepository,
  type DeliveryEffect,
} from "@velobase/subscriptions/delivery";
import { cycleDraftSchema, SubscriptionsError } from "@velobase/subscriptions";
import { GrantInputSchema } from "@velobase/credits/schemas";
import { settleGrant } from "@/server/billing/services/grant";
import { db } from "@/server/db";

type Row = DeliveryIdentity & { plan: unknown; completedAt: Date | null };
const repository: SubscriptionDeliveryRepository<Prisma.TransactionClient> = {
  prepare: (identity, makePlan) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription-delivery:${identity.key}`},0))`;
      const [stored] = await tx.$queryRaw<
        Row[]
      >`SELECT id AS key, user_id AS "userId", subscription_id AS "subscriptionId", plan, completed_at AS "completedAt" FROM membership_subscription_deliveries WHERE id=${identity.key}`;
      if (stored) {
        if (
          stored.userId !== identity.userId ||
          stored.subscriptionId !== identity.subscriptionId
        )
          throw new SubscriptionsError(
            "CONFLICT",
            "Delivery identity belongs to a different subscription",
          );
        const acknowledged = await tx.$queryRaw<
          { key: string }[]
        >`SELECT effect_key AS key FROM membership_subscription_delivery_effects WHERE delivery_id=${identity.key} AND completed_at IS NOT NULL`;
        return {
          ...stored,
          plan: deliveryPlanSchema.parse(stored.plan),
          completedEffectKeys: acknowledged.map((row) => row.key),
        };
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription:subscription:${identity.subscriptionId}`},0))`;
      const sub = await tx.userSubscription.findUnique({
        where: { id: identity.subscriptionId },
      });
      if (!sub || sub.userId !== identity.userId || sub.deletedAt)
        throw new SubscriptionsError(
          "NOT_FOUND",
          "Subscription not found for delivery",
        );
      const plan = deliveryPlanSchema.parse(await makePlan(tx));
      const cycle = await tx.userSubscriptionCycle.findUnique({
        where: { id: plan.cycleId },
      });
      if (!cycle || cycle.subscriptionId !== sub.id || cycle.deletedAt)
        throw new SubscriptionsError(
          "CONFLICT",
          "Delivery cycle does not belong to this subscription",
        );
      await tx.$executeRaw`INSERT INTO membership_subscription_deliveries (id,user_id,subscription_id,cycle_id,plan) VALUES (${identity.key},${identity.userId},${identity.subscriptionId},${plan.cycleId},${JSON.stringify(plan)}::jsonb)`;
      if (plan.effects.length)
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO membership_subscription_delivery_effects (delivery_id,effect_key) VALUES ${Prisma.join(plan.effects.map((effect) => Prisma.sql`(${identity.key},${effect.key})`))}`,
        );
      return { ...identity, plan, completedEffectKeys: [], completedAt: null };
    }),
  async acknowledge(identity, key, result) {
    const count =
      await db.$executeRaw`UPDATE membership_subscription_delivery_effects e SET result=${JSON.stringify(result)}::jsonb, completed_at=CURRENT_TIMESTAMP FROM membership_subscription_deliveries d WHERE d.id=e.delivery_id AND d.id=${identity.key} AND d.user_id=${identity.userId} AND d.subscription_id=${identity.subscriptionId} AND e.effect_key=${key} AND e.completed_at IS NULL`;
    if (count === 0) {
      const [found] = await db.$queryRaw<
        { completedAt: Date | null }[]
      >`SELECT e.completed_at AS "completedAt" FROM membership_subscription_delivery_effects e JOIN membership_subscription_deliveries d ON d.id=e.delivery_id WHERE d.id=${identity.key} AND d.user_id=${identity.userId} AND d.subscription_id=${identity.subscriptionId} AND e.effect_key=${key}`;
      if (!found?.completedAt)
        throw new SubscriptionsError(
          "CONFLICT",
          "Delivery effect was not recorded",
        );
    }
  },
  async complete(identity) {
    const count =
      await db.$executeRaw`UPDATE membership_subscription_deliveries d SET completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE d.id=${identity.key} AND d.user_id=${identity.userId} AND d.subscription_id=${identity.subscriptionId} AND NOT EXISTS (SELECT 1 FROM membership_subscription_delivery_effects e WHERE e.delivery_id=d.id AND e.completed_at IS NULL)`;
    if (count !== 1)
      throw new SubscriptionsError(
        "CONFLICT",
        "Subscription delivery is incomplete",
      );
  },
};
export const subscriptionDeliveries = createSubscriptionDeliveries(repository);

export async function findSubscriptionDelivery(key: string, userId: string) {
  const [row] = await db.$queryRaw<
    Row[]
  >`SELECT id AS key, user_id AS "userId", subscription_id AS "subscriptionId", plan, completed_at AS "completedAt" FROM membership_subscription_deliveries WHERE id=${key} AND user_id=${userId}`;
  return row ? { ...row, plan: deliveryPlanSchema.parse(row.plan) } : null;
}

/** Called only while the receipt transaction owns the subscription lock. */
export async function prepareDeliveryCycle(
  tx: Prisma.TransactionClient,
  input: unknown,
): Promise<UserSubscriptionCycle> {
  const draft = cycleDraftSchema.parse(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription-cycle:${draft.uniqueKey}`},0))`;
  const existing =
    (await tx.userSubscriptionCycle.findUnique({
      where: { uniqueKey: draft.uniqueKey },
    })) ??
    (draft.paymentId
      ? await tx.userSubscriptionCycle.findFirst({
          where: { paymentId: draft.paymentId, deletedAt: null },
        })
      : null);
  if (existing) {
    if (
      existing.subscriptionId !== draft.subscriptionId ||
      existing.type !== draft.type ||
      existing.deletedAt ||
      (existing.paymentId ?? undefined) !== draft.paymentId
    )
      throw new SubscriptionsError(
        "CONFLICT",
        "Cycle identity belongs to a different paid period",
      );
    return existing;
  }
  const latest = await tx.userSubscriptionCycle.findFirst({
    where: { subscriptionId: draft.subscriptionId },
    orderBy: { sequenceNumber: "desc" },
  });
  const sub = await tx.userSubscription.findUniqueOrThrow({
    where: { id: draft.subscriptionId },
  });
  // A delayed invoice still records its obligation, without restoring canceled access.
  return tx.userSubscriptionCycle.create({
    data: {
      ...draft,
      sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
      status: ["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status)
        ? "CLOSED"
        : "ACTIVE",
    },
  });
}

const savedGrantSchema = GrantInputSchema.extend({
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
/** The complete example chooses credits explicitly. Other hosts supply a different consumer. */
export async function deliverSubscriptionEffect(
  effect: DeliveryEffect,
  record: PreparedDelivery,
) {
  if (effect.kind !== "credits.grant")
    throw new SubscriptionsError(
      "UNAVAILABLE",
      "Subscription entitlement consumer is not selected",
    );
  const saved = savedGrantSchema.parse(effect.payload);
  if (saved.userId !== record.userId || saved.outerBizId !== effect.key)
    throw new SubscriptionsError(
      "CONFLICT",
      "Subscription credit identity changed",
    );
  const receipt = await settleGrant({
    ...saved,
    startsAt: new Date(saved.startsAt),
    expiresAt: new Date(saved.expiresAt),
  });
  return {
    accountId: receipt.accountId,
    recordId: receipt.recordId,
    isIdempotentReplay: receipt.isIdempotentReplay,
  };
}

/** Do not move the drip cursor backwards when an old invoice is replayed. */
export async function recordFirstCreditAnchor(cycleId: string, startsAt: Date) {
  await db.userSubscriptionCycle.updateMany({
    where: {
      id: cycleId,
      OR: [
        { lastCreditGrantAnchor: null },
        { lastCreditGrantAnchor: { lt: startsAt } },
      ],
    },
    data: { lastCreditGrantAnchor: startsAt },
  });
}
