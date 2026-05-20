import { db } from "@/server/db";
import { logger } from "@/server/shared/telemetry/logger";
import { appEvents } from "@/server/events/bus";
import type { WebhookEvent } from "../../providers/types";

export async function onSubscriptionUpdated(event: WebhookEvent, _adapterName: string) {
  const subId = event.subscriptionId;
  if (!subId) return { status: "ignored" };

  const userSub = await db.userSubscription.findFirst({ where: { gatewaySubscriptionId: subId } });
  if (!userSub) {
    logger.warn({ subscriptionId: subId }, "UserSubscription not found for update");
    return { status: "ignored" };
  }

  const now = new Date();
  const cancelAtPeriodEnd = event.subscription?.cancelAtPeriodEnd;
  const canceledAt = event.subscription?.canceledAt;

  if (typeof cancelAtPeriodEnd !== "boolean") {
    // No actionable subscription data
    return { status: "ignored" };
  }

  const shouldSetCanceledAt = cancelAtPeriodEnd && userSub.canceledAt == null;

  const updated = await db.userSubscription.update({
    where: { id: userSub.id },
    data: {
      status: "ACTIVE",
      cancelAtPeriodEnd,
      canceledAt: cancelAtPeriodEnd
        ? (canceledAt ?? (shouldSetCanceledAt ? now : userSub.canceledAt))
        : null,
      endedAt: null,
    },
  });

  if (cancelAtPeriodEnd) {
    await appEvents.emit("subscription:canceled", {
      subscriptionId: updated.id,
      userId: updated.userId,
      cancelAtPeriodEnd: true,
    });
  }

  logger.info({ subscriptionId: userSub.id, cancelAtPeriodEnd }, "Subscription updated");
  return { status: "updated" };
}
