import { subscriptions } from "@/modules/subscriptions/server/service";
import { appEvents } from "@/server/events/bus";

interface CancelSubscriptionNowParams {
  subscriptionId: string;
  userId: string;
}

/** Confirm remote cancellation before ending local cycles. A failed request remains retryable. */
export async function cancelSubscriptionNow(
  params: CancelSubscriptionNowParams,
): Promise<void> {
  const sub = await subscriptions.cancel(params.userId, params.subscriptionId, {
    atPeriodEnd: false,
  });
  await appEvents.emit("subscription:canceled", {
    subscriptionId: sub.id,
    userId: sub.userId,
    cancelAtPeriodEnd: false,
  });
}
