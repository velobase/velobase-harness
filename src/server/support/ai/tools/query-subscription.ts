/**
 * 查询订阅状态工具
 */

import { db } from "@/server/db";

export interface SubscriptionInfo {
  hasSubscription: boolean;
  planName?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
  canceledAt?: Date;
}

/**
 * 查询用户订阅状态
 */
export async function querySubscription(userId: string): Promise<SubscriptionInfo> {
  const subscription = await db.userSubscription.findFirst({
    where: {
      userId,
      deletedAt: null,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return { hasSubscription: false };
  }

  const planSnapshot = subscription.planSnapshot as { name?: string } | null;

  // 获取当前周期
  const currentCycle = await db.userSubscriptionCycle.findFirst({
    where: {
      subscriptionId: subscription.id,
      status: "ACTIVE",
      deletedAt: null,
      startsAt: { lte: new Date() },
      expiresAt: { gt: new Date() },
    },
    orderBy: { startsAt: "desc" },
  });

  return {
    hasSubscription: true,
    planName: planSnapshot?.name ?? "Unknown",
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodEnd: currentCycle?.expiresAt,
    canceledAt: subscription.canceledAt ?? undefined,
  };
}
