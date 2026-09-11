import { db } from "@/server/db";
import { subscriptions } from "@/modules/subscriptions/server/service";
import type {
  GetSubscriptionStatusParams,
  SubscriptionStatusResult,
  SubscriptionPlanType,
} from "../types";

/** The domain owns relationship/period reads; the complete example owns its plan tier labels. */
export async function getSubscriptionStatus(
  params: GetSubscriptionStatusParams,
): Promise<SubscriptionStatusResult> {
  const current = await subscriptions.current(params.userId);
  if (!current) return { status: "NONE" };
  const { subscription: sub, cycle } = current;
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: sub.planId },
    select: { type: true },
  });
  const planType: SubscriptionPlanType | undefined =
    plan?.type === "STARTER" ||
    plan?.type === "PLUS" ||
    plan?.type === "PREMIUM"
      ? plan.type
      : undefined;
  return {
    status: sub.status,
    subscriptionId: sub.id,
    planType,
    currentCycle: cycle
      ? {
          id: cycle.id,
          type: cycle.type,
          status: cycle.status,
          startsAt: cycle.startsAt,
          expiresAt: cycle.expiresAt,
        }
      : undefined,
  };
}
