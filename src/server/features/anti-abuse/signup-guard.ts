/**
 * 注册反滥用守卫（Signup Anti-Abuse Guard）
 *
 * 新用户注册后，异步检查是否存在白嫖/滥用行为，并在确认滥用时回收已发放的积分。
 *
 * 检测维度：
 * 1. 同设备多号 — 最强信号，直接判定
 * 2. 同 IP 历史囤号 — 超过阈值直接判定
 * 3. 同 IP + 同设备指纹 — 强信号
 * 4. 同 IP 短时密集注册 — 按时间窗口+密度阈值判定
 *
 * 处置方式："先发后收" — 注册时全额发放积分，检测到滥用后通过 Velobase deduct 回收。
 */

import { db } from '@/server/db'
import { createLogger } from '@/lib/logger'

const logger = createLogger('features:anti-abuse:signup')

// ─── 策略常量（AI：修改这里来调整滥用检测灵敏度） ────────────────────
/** 同 IP 时间窗口（小时）：只看最近 N 小时内的注册 */
const SAME_IP_WINDOW_HOURS = 24
/** 同 IP + 不同设备：窗口内至少有几个先行账号才判滥用 */
const SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE = 1
/** 同 IP + 未知设备：窗口内至少有几个先行账号才判滥用 */
const SAME_IP_MIN_PRIOR_UNKNOWN_DEVICE = 1
/** 同 IP 历史总量上限：超过此值直接判为代理池/囤号，不受时间窗口限制 */
const SAME_IP_MAX_TOTAL_HISTORY = 20
// ────────────────────────────────────────────────────────────────────

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface AbuseCheckResult {
  isAbuse: boolean
  reason?: string
  existingEmails?: string[]
}

interface ClawbackOptions {
  /** 回收时用的 businessType 描述前缀，默认 "Abuse clawback" */
  descriptionPrefix?: string
}

// ─── 核心检测函数 ──────────────────────────────────────────────────

/**
 * 检查新注册用户是否存在滥用行为。
 *
 * 纯检测，不执行任何处置动作。可以在注册前预判，也可以注册后复查。
 */
export async function checkSignupAbuse(params: {
  userId: string
  email: string
  signupIp: string
}): Promise<AbuseCheckResult> {
  const { userId, email, signupIp } = params

  if (!signupIp || signupIp === 'unknown') {
    return { isAbuse: false, reason: 'NO_SIGNUP_IP' }
  }

  // ── 维度 1：历史总量（防囤号/长期代理 IP）──
  const totalHistoryCount = await db.user.count({
    where: { signupIp, id: { not: userId } },
  })

  if (totalHistoryCount >= SAME_IP_MAX_TOTAL_HISTORY) {
    logger.warn(
      { userId, email, signupIp, totalHistoryCount, limit: SAME_IP_MAX_TOTAL_HISTORY },
      'Same IP exceeds total history limit',
    )
    return {
      isAbuse: true,
      reason: `Same IP has ${totalHistoryCount} historical accounts (limit ${SAME_IP_MAX_TOTAL_HISTORY})`,
      existingEmails: [],
    }
  }

  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, deviceKeyAtSignup: true, isPrimaryDeviceAccount: true },
  })

  if (!currentUser) {
    logger.warn({ userId, signupIp }, 'User not found during abuse check')
    return { isAbuse: false, reason: 'USER_NOT_FOUND' }
  }

  // ── 维度 2：同设备多号（共享设备 / 多开） → 直接判定 ──
  if (currentUser.isPrimaryDeviceAccount === false) {
    logger.warn({ userId, email, signupIp }, 'Non-primary device account')
    return { isAbuse: true, reason: 'NON_PRIMARY_DEVICE_ACCOUNT' }
  }

  // ── 维度 3 & 4：时间窗内同 IP 账号分析 ──
  const windowMs = SAME_IP_WINDOW_HOURS * 60 * 60 * 1000
  const since = new Date(currentUser.createdAt.getTime() - windowMs)

  const existingUsers = await db.user.findMany({
    where: {
      signupIp,
      id: { not: userId },
      isBlocked: false,
      createdAt: { gte: since, lte: currentUser.createdAt },
    },
    select: { id: true, email: true, createdAt: true, deviceKeyAtSignup: true },
    take: 50,
  })

  if (existingUsers.length === 0) {
    return { isAbuse: false, reason: 'NO_RECENT_SAME_IP_USERS' }
  }

  const existingEmails = existingUsers
    .map((u) => u.email)
    .filter((e): e is string => e !== null)

  const currentDeviceKey = currentUser.deviceKeyAtSignup
  const hasSameDeviceKey =
    !!currentDeviceKey && existingUsers.some((u) => u.deviceKeyAtSignup === currentDeviceKey)

  if (hasSameDeviceKey) {
    logger.warn({ userId, email, signupIp, existingEmails }, 'Same IP + same deviceKey')
    return { isAbuse: true, reason: 'SAME_IP_SAME_DEVICE_KEY', existingEmails }
  }

  // 同 IP 但不同设备：按短时密度判定
  const minPrior = currentDeviceKey
    ? SAME_IP_MIN_PRIOR_DIFFERENT_DEVICE
    : SAME_IP_MIN_PRIOR_UNKNOWN_DEVICE

  if (existingUsers.length >= minPrior) {
    logger.warn(
      { userId, email, signupIp, existingEmails, count: existingUsers.length, windowHours: SAME_IP_WINDOW_HOURS, minPrior },
      'Same IP burst within window',
    )
    return {
      isAbuse: true,
      reason: `Same IP has ${existingUsers.length} other account(s) within ${SAME_IP_WINDOW_HOURS}h`,
      existingEmails,
    }
  }

  logger.info(
    { userId, email, signupIp, count: existingUsers.length, windowHours: SAME_IP_WINDOW_HOURS, minPrior },
    'Same IP seen but low density; not abuse',
  )
  return { isAbuse: false, reason: 'SAME_IP_LOW_DENSITY_DIFFERENT_DEVICE', existingEmails }
}

// ─── 处置函数：检测 + 回收积分 ──────────────────────────────────────

/**
 * 检测滥用并在确认后回收已发放积分。
 *
 * 典型用法：在 `auth/config.ts` signIn 事件中异步调用（void fire-and-forget）。
 *
 * ```ts
 * import { enforceSignupAbuse } from '@/server/features/anti-abuse'
 * void enforceSignupAbuse(userId, email, ip)
 * ```
 */
export async function enforceSignupAbuse(
  userId: string,
  email: string,
  signupIp: string,
  precomputed?: AbuseCheckResult,
  options?: ClawbackOptions,
): Promise<boolean> {
  const result = precomputed ?? (await checkSignupAbuse({ userId, email, signupIp }))

  try {
    if (result.isAbuse) {
      const { settleDeduction: postConsume } = await import('@/server/billing/services/post-consume')
      const { getBalance } = await import('@/server/billing/services/get-balance')

      const balance = await getBalance({ userId })
      if (balance.totalSummary.available > 0) {
        const prefix = options?.descriptionPrefix ?? 'Abuse clawback'
        await postConsume({
          userId,
          amount: balance.totalSummary.available,
          businessId: `abuse_clawback_${userId}_${Date.now()}`,
          businessType: "ADMIN_GRANT",
          description: `${prefix}: ${result.reason}`,
        })
      }

      logger.warn(
        { userId, email, signupIp, existingEmails: result.existingEmails },
        'Abuse confirmed: clawed back initial credits',
      )
    } else {
      logger.info({ userId, email, signupIp }, 'No abuse detected: credits remain')
    }

    // 异步通知（飞书等），不阻塞主流程
    try {
      const { sendEmailAbuseNotification } = await import('@/lib/lark/notifications')
      void sendEmailAbuseNotification({
        userId,
        email,
        signupIp,
        abuseScore: result.isAbuse ? 100 : 0,
        reason: result.reason ?? 'Unknown',
        existingEmails: result.existingEmails ?? [],
        blocked: false,
      })
    } catch {
      // 通知失败不影响主逻辑
    }
  } catch (error) {
    logger.warn({ error, userId, email, signupIp }, 'Failed to enforce abuse decision')
  }

  return result.isAbuse
}
