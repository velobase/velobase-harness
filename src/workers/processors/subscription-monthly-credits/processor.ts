/**
 * Subscription Monthly Credits Processor
 *
 * 年付订阅按月发放积分（也兼容多月周期），基于 lastCreditGrantAnchor + BullMQ 定时任务。
 */
import type { Job } from "bullmq";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { settleGrant as grant } from "@/server/billing/services/grant";
import type { SubscriptionMonthlyCreditsJobData } from "../../queues/subscription-monthly-credits.queue";

const logger = createLogger("subscription-monthly-credits");

export async function processSubscriptionMonthlyCreditsJob(
  job: Job<SubscriptionMonthlyCreditsJobData>,
): Promise<void> {
  if (job.data.type === "scheduled-scan") {
    await processMonthlyCredits();
  }
}

async function processMonthlyCredits(): Promise<void> {
  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  // 仅处理已经有锚点的周期，避免老数据（没有锚点、一次性发全年积分）被重复拆分
  const cycles = await db.userSubscriptionCycle.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: now },
      lastCreditGrantAnchor: {
        not: null,
        lte: oneMonthAgo,
      },
    },
    include: {
      subscription: true,
    },
    take: 100, // 一次最多处理 100 个，防止单次任务过重
  });

  if (cycles.length === 0) {
    logger.info("No eligible subscription cycles found for monthly credits");
    return;
  }

  logger.info(
    { count: cycles.length },
    "Found eligible subscription cycles for monthly credits",
  );

  for (const cycle of cycles) {
    try {
      await processSingleCycle(cycle.id);
    } catch (error) {
      logger.error(
        { cycleId: cycle.id, error },
        "Failed to process monthly credits for cycle",
      );
    }
  }
}

async function processSingleCycle(cycleId: string): Promise<void> {
  const now = new Date();

  const cycle = await db.userSubscriptionCycle.findUnique({
    where: { id: cycleId },
    include: { subscription: true },
  });

  if (!cycle || !cycle.subscription) {
    return;
  }

  if (cycle.status !== "ACTIVE" || cycle.expiresAt <= now) {
    return;
  }

  if (!cycle.lastCreditGrantAnchor) {
    // 只处理新逻辑创建的周期（有锚点）
    return;
  }

  // 从 planSnapshot 中解析 creditsPerPeriod（兼容 creditsPerMonth）
  const snapshot = cycle.subscription.planSnapshot as unknown as {
    productSubscription?: {
      plan?: {
        interval?: string;
        creditsPerPeriod?: number;
        creditsPerMonth?: number;
      };
    };
  };

  const plan = snapshot.productSubscription?.plan;
  const intervalRaw = typeof plan?.interval === "string" ? plan.interval : "";
  // This worker is for MONTH/YEAR drip. WEEK plans are handled by future-dated weekly grants at fulfillment time.
  if (intervalRaw.toUpperCase() === "WEEK") {
    return;
  }
  const creditsPerPeriod = plan?.creditsPerPeriod ?? plan?.creditsPerMonth ?? 0;

  if (!creditsPerPeriod || creditsPerPeriod <= 0) {
    return;
  }

  // 计算下一个锚点（上一锚点 + 1 个月）
  const lastAnchor = cycle.lastCreditGrantAnchor;
  const nextAnchor = new Date(lastAnchor);
  nextAnchor.setMonth(nextAnchor.getMonth() + 1);

  // 还没到下一个月，不发
  if (nextAnchor > now) {
    return;
  }

  // 周期已结束或即将结束且 nextAnchor 落在周期外，则不再发放
  if (nextAnchor > cycle.expiresAt) {
    logger.info(
      { cycleId: cycle.id, nextAnchor, expiresAt: cycle.expiresAt },
      "Next credit grant anchor is beyond cycle expiration, skipping",
    );
    return;
  }

  const monthStr = nextAnchor.toISOString().slice(0, 7); // YYYY-MM
  const outerBizId = `subscription_cycle_${cycle.id}_credits_${monthStr}`;

  // 当月积分的有效期：从 nextAnchor 到 nextAnchor + 1 个月
  const creditStartsAt = nextAnchor;
  const creditExpiresAt = new Date(nextAnchor);
  creditExpiresAt.setMonth(creditExpiresAt.getMonth() + 1);

  logger.info(
    {
      cycleId: cycle.id,
      subscriptionId: cycle.subscriptionId,
      userId: cycle.subscription.userId,
      creditsPerPeriod,
      lastAnchor,
      nextAnchor,
      outerBizId,
    },
    "Granting monthly subscription credits",
  );

  // grant 自身具备基于 outerBizId 的幂等性；这里不再额外查询 BillingAccount
  await grant({
    userId: cycle.subscription.userId,
    source: "membership",
    amount: creditsPerPeriod,
    outerBizId,
    businessType: "SUBSCRIPTION",
    referenceId: cycle.id,
    description: `Subscription monthly credits (${monthStr})`,
    startsAt: creditStartsAt,
    expiresAt: creditExpiresAt,
  });

  await db.userSubscriptionCycle.update({
    where: { id: cycle.id },
    data: { lastCreditGrantAnchor: nextAnchor },
  });
}
