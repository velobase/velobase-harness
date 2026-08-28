/**
 * Email Abuse Detection Service
 *
 * 检测同 IP 注册的多个账号
 * 规则（优化版）：
 * - IP 是弱信号：只看「时间窗内」的同 IP 账号，避免 NAT/公司网的历史账号误伤
 * - 设备 key 是强信号：同设备多号直接判滥用（不依赖 IP）
 * - 同 IP 但不同设备：需要达到更高的“短时密度”才判滥用
 */

import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { sendEmailAbuseNotification } from "@/lib/lark/notifications";
import { env } from "@/env";

const logger = createLogger("auth:email-abuse");

const SAME_IP_WINDOW_HOURS = env.EMAIL_ABUSE_SAME_IP_WINDOW_HOURS;
const SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE =
  env.EMAIL_ABUSE_SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE;
const SAME_IP_MIN_PRIOR_UNKNOWN_DEVICE =
  env.EMAIL_ABUSE_SAME_IP_MIN_PRIOR_UNKNOWN_DEVICE;
const SAME_IP_MAX_TOTAL_HISTORY = env.EMAIL_ABUSE_SAME_IP_MAX_TOTAL_HISTORY;

// ============================================================================
// Types
// ============================================================================

interface CheckEmailAbuseParams {
  userId: string;
  email: string;
  signupIp: string;
}

interface CheckEmailAbuseResult {
  isAbuse: boolean;
  reason?: string;
  existingEmails?: string[];
}

// ============================================================================
// Main Check Function
// ============================================================================

/**
 * 检查新注册用户是否为邮箱滥用
 *
 * 优化规则：
 * - 历史总量：如果该 IP 历史累计账号数 > SAME_IP_MAX_TOTAL_HISTORY，视为高风险 IP（囤号/代理池），直接判滥用
 * - 时间窗：如果历史总量未超标，则只看用户创建时间往前 SAME_IP_WINDOW_HOURS 的同 IP 账号
 * - 设备优先：如果该用户不是该设备的首账号（isPrimaryDeviceAccount=false），直接判滥用
 * - 同 IP 不同设备：需要短时密度 >= SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE 才判滥用
 * 后果：不给额外积分（不封号）
 */
export async function checkEmailAbuse(
  params: CheckEmailAbuseParams,
): Promise<CheckEmailAbuseResult> {
  const { userId, email, signupIp } = params;

  if (!signupIp || signupIp === "unknown") {
    return { isAbuse: false, reason: "NO_SIGNUP_IP" };
  }

  // 1. 检查历史总量（防囤号/长期代理 IP）
  // 只需要 count，不需要拉取详情
  const totalHistoryCount = await db.user.count({
    where: {
      signupIp,
      id: { not: userId },
      // 不排除 isBlocked，因为被封的号也是该 IP 历史“脏”的证据
    },
  });

  if (totalHistoryCount >= SAME_IP_MAX_TOTAL_HISTORY) {
    logger.warn(
      { userId, email, signupIp, totalHistoryCount, limit: SAME_IP_MAX_TOTAL_HISTORY },
      "Same IP has too many historical accounts (hoarding/proxy pool), marking as abuse",
    );
    return {
      isAbuse: true,
      reason: `Same IP has ${totalHistoryCount} historical accounts (limit ${SAME_IP_MAX_TOTAL_HISTORY})`,
      existingEmails: [], // 太多了就不列了
    };
  }

  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      deviceKeyAtSignup: true,
      isPrimaryDeviceAccount: true,
    },
  });

  if (!currentUser) {
    logger.warn({ userId, signupIp }, "User not found while checking email abuse");
    return { isAbuse: false, reason: "USER_NOT_FOUND" };
  }

  // 强信号：同设备多号（共享设备/多开） -> 直接判滥用
  if (currentUser.isPrimaryDeviceAccount === false) {
    logger.warn({ userId, email, signupIp }, "Non-primary device account, marking as abuse");
    return { isAbuse: true, reason: "NON_PRIMARY_DEVICE_ACCOUNT" };
  }

  const windowMs = SAME_IP_WINDOW_HOURS * 60 * 60 * 1000;
  const since = new Date(currentUser.createdAt.getTime() - windowMs);

  // 查找时间窗内同 IP 的其他账号（避免历史 NAT 账号误伤）
  const existingUsers = await db.user.findMany({
    where: {
      signupIp,
      id: { not: userId },
      isBlocked: false,
      createdAt: {
        gte: since,
        lte: currentUser.createdAt,
      },
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
      deviceKeyAtSignup: true,
    },
    take: 50,
  });

  if (existingUsers.length === 0) {
    logger.debug({ userId, signupIp }, "No recent users from same IP within window");
    return { isAbuse: false, reason: "NO_RECENT_SAME_IP_USERS" };
  }

  const existingEmails = existingUsers
    .map((u) => u.email)
    .filter((e): e is string => e !== null);

  const currentDeviceKey = currentUser.deviceKeyAtSignup;
  const hasSameDeviceKey =
    !!currentDeviceKey && existingUsers.some((u) => u.deviceKeyAtSignup && u.deviceKeyAtSignup === currentDeviceKey);

  if (hasSameDeviceKey) {
    logger.warn(
      { userId, email, signupIp, existingEmails },
      "Same IP + same deviceKey, marking as abuse",
    );
    return {
      isAbuse: true,
      reason: "SAME_IP_SAME_DEVICE_KEY",
      existingEmails,
    };
  }

  // 同 IP 但不同设备：按短时密度判定
  const minPrior =
    currentDeviceKey ? SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE : SAME_IP_MIN_PRIOR_UNKNOWN_DEVICE;

  if (existingUsers.length >= minPrior) {
    logger.warn(
      { userId, email, signupIp, existingEmails, existingUsers: existingUsers.length, windowHours: SAME_IP_WINDOW_HOURS, minPrior },
      "Same IP burst within window, marking as abuse",
    );
    return {
      isAbuse: true,
      reason: `Same IP has ${existingUsers.length} other account(s) within ${SAME_IP_WINDOW_HOURS}h`,
      existingEmails,
    };
  }

  logger.info(
    { userId, email, signupIp, existingUsers: existingUsers.length, windowHours: SAME_IP_WINDOW_HOURS, minPrior },
    "Same IP seen but different device and low density; not abuse",
  );

  return {
    isAbuse: false,
    reason: "SAME_IP_LOW_DENSITY_DIFFERENT_DEVICE",
    existingEmails,
  };
}

/**
 * 检查并处理滥用用户的积分
 *
 * 如果检测到滥用，通过 Velobase deduct 回收已发放的初始积分。
 * 此设计不再依赖本地 BillingAccount 的 PENDING→ACTIVE/INVALID 状态流转，
 * 而是：先正常发放积分（grant），滥用检测异步扣回（deduct）。
 */
export async function checkAndBlockEmailAbuse(
  userId: string,
  email: string,
  signupIp: string,
  precomputed?: CheckEmailAbuseResult,
): Promise<boolean> {
  const result = precomputed ?? (await checkEmailAbuse({ userId, email, signupIp }));

  try {
    if (result.isAbuse) {
      const { postConsume } = await import("@/server/billing/services/post-consume");
      const { getBalance } = await import("@/server/billing/services/get-balance");

      const balance = await getBalance({ userId });
      if (balance.totalSummary.available > 0) {
        await postConsume({
          userId,
          amount: balance.totalSummary.available,
          businessId: `abuse_clawback_${userId}_${Date.now()}`,
          businessType: "ADMIN_GRANT",
          description: `Abuse clawback: ${result.reason}`,
        });
      }

      logger.warn(
        { userId, email, signupIp, existingEmails: result.existingEmails },
        "Same IP abuse: clawed back initial credits via Velobase deduct",
      );
    } else {
      logger.info(
        { userId, email, signupIp },
        "No same IP abuse: initial credits remain active",
      );
    }

    void sendEmailAbuseNotification({
      userId,
      email,
      signupIp,
      abuseScore: result.isAbuse ? 100 : 0,
      reason: result.reason ?? "Unknown",
      existingEmails: result.existingEmails ?? [],
      blocked: false,
    });
  } catch (error) {
    logger.warn(
      { error, userId, email, signupIp },
      "Failed to apply email abuse decision",
    );
  }

  return result.isAbuse;
}
