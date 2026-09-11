import { isFeatureEnabled } from "@/server/features/state";
import { db } from "@/server/db";
import { UserOfferState, UserOfferType } from "@prisma/client";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";

export interface NewUserUnlockOfferResult {
  state: UserOfferState;
  endsAt?: Date | null;
  startedAt?: Date | null;
}

export async function getNewUserUnlockOffer({
  userId,
  now = new Date(),
}: {
  userId: string;
  now?: Date;
}): Promise<NewUserUnlockOfferResult | null> {
  if (!(await isFeatureEnabled("newcomer-offers"))) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) return null;

  // Only hide offer if user has an active subscription (not just any purchase)
  const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({
    status: "NONE" as const,
    currentCycle: null,
  }));
  if (subStatus.currentCycle) return null;

  const offer = await db.userOffer.findUnique({
    where: {
      userId_type: {
        userId,
        type: UserOfferType.NEW_USER_UNLOCK,
      },
    },
    select: { state: true, endsAt: true, startedAt: true },
  });

  if (!offer) return null;

  // Lazy-expire
  if (
    offer.state === UserOfferState.ACTIVE &&
    offer.endsAt &&
    offer.endsAt.getTime() <= now.getTime()
  ) {
    const updated = await db.userOffer.update({
      where: {
        userId_type: {
          userId,
          type: UserOfferType.NEW_USER_UNLOCK,
        },
      },
      data: { state: UserOfferState.EXPIRED },
      select: { state: true, endsAt: true, startedAt: true },
    });
    return {
      state: updated.state,
      endsAt: updated.endsAt,
      startedAt: updated.startedAt,
    };
  }

  return {
    state: offer.state,
    endsAt: offer.endsAt,
    startedAt: offer.startedAt,
  };
}
