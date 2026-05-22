import { db } from "@/server/db";
import { logger } from "@/server/shared/telemetry/logger";
import type { WebhookEvent } from "../../providers/types";

export async function onSubscriptionCanceled(event: WebhookEvent, _adapterName: string) {
  const subId = event.subscriptionId;
  if (!subId) return { status: "ignored" };

  const userSub = await db.userSubscription.findFirst({ where: { gatewaySubscriptionId: subId } });
  if (!userSub) {
    logger.warn({ subscriptionId: subId }, "UserSubscription not found for cancellation");
    return { status: "ignored" };
  }

  const now = new Date();
  await db.userSubscription.update({
    where: { id: userSub.id },
    data: {
      status: "CANCELED",
      cancelAtPeriodEnd: false,
      canceledAt: userSub.canceledAt ?? event.subscription?.canceledAt ?? now,
      endedAt: userSub.endedAt ?? event.subscription?.endedAt ?? now,
    },
  });

  logger.info({ subscriptionId: userSub.id }, "Subscription canceled");
  return { status: "canceled" };
}
