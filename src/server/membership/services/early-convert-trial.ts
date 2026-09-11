import { subscriptions } from "@/modules/subscriptions/server/service";
import { SubscriptionsError } from "@velobase/subscriptions";
import { logger } from "@/server/shared/telemetry/logger";

/** New conversion is gated; subsequent verified invoices settle its paid period separately. */
export async function earlyConvertTrial({ userId }: { userId: string }) {
  const current = await subscriptions.current(userId);
  if (!current)
    throw new SubscriptionsError(
      "NOT_FOUND",
      "No active subscription found to convert",
    );
  await subscriptions.convertTrial(userId, current.subscription.id);
  logger.info(
    { userId, subscriptionId: current.subscription.id },
    "Requested trial conversion",
  );
  return { ok: true };
}
