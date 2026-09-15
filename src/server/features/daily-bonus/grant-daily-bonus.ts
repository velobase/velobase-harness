import { isFeatureEnabled } from "@/server/features/state";
import { createLogger } from "@/lib/logger";
import { grant } from "@/server/billing/services/grant";
import { getRecords } from "@/server/billing/services/get-records";

const logger = createLogger("features:daily-bonus");

// ─── 策略常量（AI：修改这里来调整签到赠送行为） ────────────────────────
const BASE_AMOUNT = 5; // 首日赠送积分
const MIN_AMOUNT = 1; // 衰减下限
const DECAY_PER_DAY = 1; // 每多一天连续签到，赠送量减少多少
const RESET_AFTER_MISSED_DAYS = 1; // 中断几天后重置回首日赠送量
const EXPIRY_DAYS = 30; // 赠送积分有效天数（0 = 永不过期）
// ────────────────────────────────────────────────────────────────────

export interface DailyBonusResult {
  granted: boolean;
  amount: number;
  reason: string;
  streakDays: number;
}

/**
 * Grant daily login bonus credits to a user.
 *
 * Idempotent per calendar day (UTC) via Velobase's idempotencyKey.
 * Uses Velobase ledger to determine streak length and decay.
 */
export async function grantDailyBonus(
  userId: string,
): Promise<DailyBonusResult> {
  if (!(await isFeatureEnabled("daily-bonus")))
    return { granted: false, amount: 0, reason: "DISABLED", streakDays: 0 };
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const idempotencyKey = `daily_bonus_${userId}_${todayKey}`;

  const streakDays = await calculateStreak(userId, today);
  const amount = calculateAmount(streakDays);

  const expiresAt =
    EXPIRY_DAYS > 0
      ? new Date(today.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
      : undefined;

  try {
    const result = await grant({
      userId,
      source: "daily_login",
      amount,
      outerBizId: idempotencyKey,
      businessType: "FREE_TRIAL",
      description: `Daily login bonus (day ${streakDays + 1})`,
      expiresAt: expiresAt ?? null,
    });

    if (result.isIdempotentReplay) {
      return {
        granted: false,
        amount: 0,
        reason: "ALREADY_GRANTED",
        streakDays,
      };
    }

    logger.info(
      { userId, amount, streakDays: streakDays + 1, todayKey },
      "Daily bonus granted",
    );

    return { granted: true, amount, reason: "OK", streakDays: streakDays + 1 };
  } catch (err) {
    logger.error({ err, userId }, "Failed to grant daily bonus");
    return { granted: false, amount: 0, reason: "ERROR", streakDays };
  }
}

// ─── 策略函数（AI：修改这里来改变赠送公式） ─────────────────────────
/**
 * 根据连续签到天数计算本次赠送量。
 *
 * 默认策略：线性衰减
 *   day 1 → BASE_AMOUNT
 *   day 2 → BASE_AMOUNT - DECAY_PER_DAY
 *   ...
 *   day N → max(MIN_AMOUNT, BASE_AMOUNT - (N-1) * DECAY_PER_DAY)
 *
 * 如需改为递增、固定值、阶梯等策略，直接修改此函数体即可。
 */
function calculateAmount(streakDays: number): number {
  return Math.max(MIN_AMOUNT, BASE_AMOUNT - streakDays * DECAY_PER_DAY);
}
// ────────────────────────────────────────────────────────────────────

/**
 * Count consecutive days the user has received daily bonus (not including today).
 */
async function calculateStreak(userId: string, today: Date): Promise<number> {
  try {
    const records = await getRecords({
      userId,
      limit: 30,
      operationType: "GRANT",
    });

    const dailyBonusDates = records.records
      .filter((r) => r.description?.startsWith("Daily login bonus"))
      .map((r) => r.createdAt.toISOString().slice(0, 10));

    const uniqueDates = [...new Set(dailyBonusDates)].sort().reverse();

    let streak = 0;
    const expectedDate = new Date(today);

    for (const dateStr of uniqueDates) {
      expectedDate.setDate(expectedDate.getDate() - 1);
      const expected = expectedDate.toISOString().slice(0, 10);

      if (dateStr === expected) {
        streak++;
      } else {
        const actualDate = new Date(dateStr + "T00:00:00Z");
        const diffDays = Math.floor(
          (expectedDate.getTime() - actualDate.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (diffDays >= RESET_AFTER_MISSED_DAYS) break;
      }
    }

    return streak;
  } catch {
    return 0;
  }
}
