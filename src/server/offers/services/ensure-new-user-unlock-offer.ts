import { isFeatureEnabled } from "@/server/features/state";
import { db } from "@/server/db";
import { UserOfferState, UserOfferType } from "@prisma/client";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";

export interface EnsureNewUserUnlockOfferResult {
  state: UserOfferState;
  endsAt?: Date | null;
  startedAt?: Date | null;
  isEligible: boolean;
  hitPaywallCount: number;
}

export async function ensureNewUserUnlockOffer({
  userId,
  source,
  variant,
  now = new Date(),
}: {
  userId: string;
  source: string;
  variant?: string;
  now?: Date;
}): Promise<EnsureNewUserUnlockOfferResult> {
  if (!(await isFeatureEnabled("newcomer-offers")))
    return {
      state: UserOfferState.INELIGIBLE,
      isEligible: false,
      hitPaywallCount: 0,
    };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) throw new Error("User not found");

  // Eligibility is based on subscription status, not any purchase.
  // Users who bought credits packs are still eligible; only active subscribers are not.
  const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({
    status: "NONE" as const,
    currentCycle: null,
  }));
  const isEligible = !subStatus.currentCycle;

  // Upsert stats counter (best-effort) + offer state in one tx for consistency
  const result = await db.$transaction(async (tx) => {
    const stats = await tx.userStats.upsert({
      where: { userId },
      create: { userId, hitPaywallCount: 1 },
      update: { hitPaywallCount: { increment: 1 } },
      select: { hitPaywallCount: true },
    });

    const existing = await tx.userOffer.findUnique({
      where: { userId_type: { userId, type: UserOfferType.NEW_USER_UNLOCK } },
      select: { state: true, endsAt: true, startedAt: true },
    });

    if (!isEligible) {
      // Keep one record for debugging/analytics, but don't override CONSUMED
      if (!existing) {
        const created = await tx.userOffer.create({
          data: {
            userId,
            type: UserOfferType.NEW_USER_UNLOCK,
            state: UserOfferState.INELIGIBLE,
            source,
            variant,
          },
          select: { state: true, endsAt: true, startedAt: true },
        });
        return {
          ...created,
          isEligible: false,
          hitPaywallCount: stats.hitPaywallCount,
        };
      }

      // If the user becomes ineligible (e.g. already purchased), ensure the record cannot be used for checkout.
      if (
        existing.state !== UserOfferState.CONSUMED &&
        existing.state !== UserOfferState.INELIGIBLE
      ) {
        const updated = await tx.userOffer.update({
          where: {
            userId_type: { userId, type: UserOfferType.NEW_USER_UNLOCK },
          },
          data: { state: UserOfferState.INELIGIBLE, source, variant },
          select: { state: true, endsAt: true, startedAt: true },
        });
        return {
          ...updated,
          isEligible: false,
          hitPaywallCount: stats.hitPaywallCount,
        };
      }

      return {
        ...existing,
        isEligible: false,
        hitPaywallCount: stats.hitPaywallCount,
      };
    }

    // Eligible: if active & not expired, return as-is
    if (
      existing?.state === UserOfferState.ACTIVE &&
      existing.endsAt &&
      existing.endsAt.getTime() > now.getTime()
    ) {
      return {
        ...existing,
        isEligible: true,
        hitPaywallCount: stats.hitPaywallCount,
      };
    }

    // Create (first hit) if missing (but never override CONSUMED / EXPIRED)
    const startedAt = now;
    const endsAt = new Date(now.getTime() + NEW_USER_UNLOCK_OFFER.durationMs);

    if (!existing) {
      const created = await tx.userOffer.create({
        data: {
          userId,
          type: UserOfferType.NEW_USER_UNLOCK,
          state: UserOfferState.ACTIVE,
          source,
          variant,
          startedAt,
          endsAt,
        },
        select: { state: true, endsAt: true, startedAt: true },
      });
      return {
        ...created,
        isEligible: true,
        hitPaywallCount: stats.hitPaywallCount,
      };
    }

    if (existing.state === UserOfferState.CONSUMED) {
      return {
        ...existing,
        isEligible: false,
        hitPaywallCount: stats.hitPaywallCount,
      };
    }

    // Do NOT restart once expired; expired offers cannot use discounted price.
    if (existing.state === UserOfferState.EXPIRED) {
      return {
        ...existing,
        isEligible: false,
        hitPaywallCount: stats.hitPaywallCount,
      };
    }

    // Existing is ACTIVE but missing endsAt (or ended): refresh to ACTIVE with new window.
    // This path should be rare; kept for data repair / partial writes.
    const updated = await tx.userOffer.update({
      where: { userId_type: { userId, type: UserOfferType.NEW_USER_UNLOCK } },
      data: {
        state: UserOfferState.ACTIVE,
        source,
        variant,
        startedAt: existing.startedAt ?? startedAt,
        endsAt: existing.endsAt ?? endsAt,
      },
      select: { state: true, endsAt: true, startedAt: true },
    });
    return {
      ...updated,
      isEligible: true,
      hitPaywallCount: stats.hitPaywallCount,
    };
  });

  return {
    state: result.state,
    endsAt: result.endsAt,
    startedAt: result.startedAt,
    isEligible: result.isEligible,
    hitPaywallCount: result.hitPaywallCount,
  };
}
