/**
 * 获取用户上下文信息（供 AI 使用）
 */

import { db } from "@/server/db";
import { logger } from "@/lib/logger";
import { getBalance } from "@/server/billing/services/get-balance";
import type { UserContext } from "../types";

/**
 * 根据用户 ID 获取完整上下文
 */
export async function getUserContext(userId: string): Promise<UserContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      stats: true,
    },
  });

  if (!user || !user.email) {
    return null;
  }

  // 获取订阅信息
  const subscription = await db.userSubscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
  });

  // 获取 credits 余额（via Velobase）
  const balanceResult = await getBalance({ userId });
  const totalCredits = balanceResult.totalSummary.available;
  const usedCredits = balanceResult.totalSummary.used;

  // 获取最近订单
  const recentOrders = await db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const context: UserContext = {
    userId,
    email: user.email,
    name: user.name ?? undefined,
    createdAt: user.createdAt,
    credits: {
      available: totalCredits,
      used: usedCredits,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      amount: o.amount,
      currency: o.currency,
      status: o.status,
      createdAt: o.createdAt,
    })),
    stats: user.stats
      ? {
          totalPaidCents: user.stats.totalPaidCents,
          ordersCount: user.stats.ordersCount,
        }
      : undefined,
  };

  // 添加订阅信息
  if (subscription) {
    const plan = subscription.planSnapshot as { name?: string } | null;
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

    context.subscription = {
      id: subscription.id,
      planName: plan?.name ?? "Unknown",
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: currentCycle?.expiresAt,
    };
  }

  return context;
}

/**
 * 根据邮箱查找用户并获取上下文
 */
export async function getUserContextByEmail(email: string): Promise<UserContext | null> {
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase() },
        { canonicalEmail: email.toLowerCase() },
      ],
    },
  });

  if (!user) {
    logger.debug({ email }, "User not found for context");
    return null;
  }

  return getUserContext(user.id);
}

/**
 * 格式化用户上下文为文本（供 AI prompt 使用）
 */
export function formatContextForPrompt(context: UserContext | null): string {
  if (!context) {
    return "User not found in our system (guest or unregistered email).";
  }

  const lines: string[] = [];

  lines.push(`**User Info:**`);
  lines.push(`- Email: ${context.email}`);
  lines.push(`- Name: ${context.name ?? "N/A"}`);
  lines.push(`- Registered: ${context.createdAt.toISOString().split("T")[0]}`);

  if (context.subscription) {
    lines.push(`\n**Subscription:**`);
    lines.push(`- Plan: ${context.subscription.planName}`);
    lines.push(`- Status: ${context.subscription.status}`);
    lines.push(`- Cancel at period end: ${context.subscription.cancelAtPeriodEnd}`);
    if (context.subscription.currentPeriodEnd) {
      lines.push(`- Current period ends: ${context.subscription.currentPeriodEnd.toISOString().split("T")[0]}`);
    }
  } else {
    lines.push(`\n**Subscription:** None`);
  }

  if (context.credits) {
    lines.push(`\n**Credits:**`);
    lines.push(`- Available: ${context.credits.available}`);
    lines.push(`- Used: ${context.credits.used}`);
  }

  if (context.stats) {
    lines.push(`\n**Stats:**`);
    lines.push(`- Total paid: $${(context.stats.totalPaidCents / 100).toFixed(2)}`);
    lines.push(`- Orders: ${context.stats.ordersCount}`);
  }

  if (context.recentOrders && context.recentOrders.length > 0) {
    lines.push(`\n**Recent Orders:**`);
    for (const order of context.recentOrders.slice(0, 3)) {
      lines.push(`- ${order.createdAt.toISOString().split("T")[0]}: $${(order.amount / 100).toFixed(2)} (${order.status})`);
    }
  }

  return lines.join("\n");
}
