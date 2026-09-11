import { z } from "zod";
import { jsonValueSchema, SubscriptionsError, type JsonValue } from "./index";

const keySchema = z.string().min(1).max(512);
export const deliveryIdentitySchema = z.object({
  key: keySchema,
  userId: z.string().min(1).max(256),
  subscriptionId: z.string().min(1).max(256),
});
export const deliveryPlanSchema = z
  .object({
    cycleId: z.string().min(1).max(256),
    context: jsonValueSchema,
    effects: z
      .array(
        z.object({
          key: keySchema,
          kind: z.string().min(1).max(64),
          payload: jsonValueSchema,
        }),
      )
      .max(1000),
  })
  .refine(
    (plan) =>
      new Set(plan.effects.map((effect) => effect.key)).size ===
      plan.effects.length,
    {
      message: "Delivery effect identities must be unique",
    },
  );
export type DeliveryIdentity = z.infer<typeof deliveryIdentitySchema>;
export type DeliveryPlan = z.infer<typeof deliveryPlanSchema>;
export type DeliveryEffect = DeliveryPlan["effects"][number];
export interface PreparedDelivery extends DeliveryIdentity {
  plan: DeliveryPlan;
  completedEffectKeys: string[];
  completedAt: Date | null;
}

export interface SubscriptionDeliveryRepository<Tx> {
  /** Serialize by identity; create the period and immutable plan in the SAME transaction.
   * Replays return the original plan without invoking makePlan. Reject owner/subscription conflicts. */
  prepare(
    identity: DeliveryIdentity,
    makePlan: (tx: Tx) => Promise<DeliveryPlan>,
  ): Promise<PreparedDelivery>;
  /** Store the consumer's durable receipt. Never mark an effect complete before delivery succeeds. */
  acknowledge(
    identity: DeliveryIdentity,
    effectKey: string,
    result: JsonValue,
  ): Promise<void>;
  /** Atomically require every planned effect to have a receipt before marking complete. */
  complete(identity: DeliveryIdentity): Promise<void>;
}

/** Subscription settlement does not depend on a credit ledger, product catalog, queue or SDK.
 * The selected host maps effects to idempotent consumers. This is at-least-once delivery:
 * a crash after a remote write can replay its SAME key and frozen payload. A consumer without
 * durable idempotency must implement its own uncertain-result reconciliation before returning. */
export function createSubscriptionDeliveries<Tx>(
  repository: SubscriptionDeliveryRepository<Tx>,
) {
  return {
    async settle(
      input: unknown,
      makePlan: (tx: Tx) => Promise<DeliveryPlan>,
      deliver: (
        effect: DeliveryEffect,
        record: PreparedDelivery,
      ) => Promise<JsonValue>,
    ): Promise<PreparedDelivery> {
      const identity = deliveryIdentitySchema.parse(input);
      const prepared = await repository.prepare(identity, async (tx) =>
        deliveryPlanSchema.parse(await makePlan(tx)),
      );
      if (
        prepared.key !== identity.key ||
        prepared.userId !== identity.userId ||
        prepared.subscriptionId !== identity.subscriptionId
      )
        throw new SubscriptionsError(
          "CONFLICT",
          "Subscription delivery identity changed",
        );
      const plan = deliveryPlanSchema.parse(prepared.plan);
      if (prepared.completedAt) return { ...prepared, plan };
      const completed = new Set(prepared.completedEffectKeys);
      for (const effect of plan.effects) {
        if (completed.has(effect.key)) continue;
        const receipt = jsonValueSchema.parse(
          await deliver(effect, { ...prepared, plan }),
        );
        await repository.acknowledge(identity, effect.key, receipt);
        completed.add(effect.key);
      }
      await repository.complete(identity);
      return {
        ...prepared,
        plan,
        completedEffectKeys: [...completed],
        completedAt: new Date(),
      };
    },
  };
}
