import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc'
import { getSubscriptionStatus } from '@/server/membership/services/get-subscription-status'
import { getBalance } from '@/server/billing/services/get-balance'
import type { GetBalanceOutput } from '@/server/billing/types'
import type { SubscriptionStatusResult } from '@/server/membership/types'
import { getClientCountryFromHeaders } from '@/server/lib/get-client-country'

const BillingStatusSchema = z.object({
  // 订阅层级：
  // - FREE: 无任何订阅
  // - STARTER: 周订阅（如 $4.99/week）
  // - PLUS: Pro 月/年订阅
  // - PREMIUM: 高阶订阅（Premium 月/年）
  tier: z.enum(['FREE', 'STARTER', 'PLUS', 'PREMIUM']).default('FREE'),
  // 是否曾经付费（包含：订阅/积分包/一次性权益等任意成功支付）
  // 用于定价/UX（例如：已付费用户不应看到更高的“锚点价”）
  hasPurchased: z.boolean().default(false),
  // 是否曾经有过订阅（历史上出现过任意 REGULAR 周期）。用于“订阅过即永久解锁”类权益（例如视频去模糊）。
  // 注意：这不代表当前仍在订阅周期内；当前订阅权益仍以 tier/interval/expiresAt 为准。
  hasEverSubscribed: z.boolean().default(false),
  // 订阅周期（若有）：MONTH / YEAR / WEEK
  interval: z.enum(['MONTH', 'YEAR', 'WEEK']).nullable(),
  expiresAt: z.date().nullable(),
  creditsBalance: z.number(),
  // Subscription metadata for richer UX (trial vs regular)
  cycleType: z.enum(['UNDEFINED', 'REGULAR', 'TRIAL']).nullable().default(null),
  trialEndsAt: z.date().nullable(),
  // Subscription relationship (contract) status from our DB (mirrors Stripe subscription.status semantics)
  subscriptionStatus: z
    .enum([
      'NONE',
      'UNDEFINED',
      'INCOMPLETE',
      'INCOMPLETE_EXPIRED',
      'TRIALING',
      'ACTIVE',
      'PAST_DUE',
      'UNPAID',
      'PAUSED',
      'CANCELED',
    ])
    .default('NONE'),
  // Plan tier from subscription relationship (even if currentCycle is missing/expired)
  subscriptionTier: z.enum(['STARTER', 'PLUS', 'PREMIUM']).nullable().default(null),
  cancelAtPeriodEnd: z.boolean().default(false),
  // Cumulative successful payments (cents).
  totalPaidCents: z.number().default(0),
})

export const accountRouter = createTRPCRouter({
  getBillingStatus: protectedProcedure
    .output(BillingStatusSchema)
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id

      const subPromise: Promise<SubscriptionStatusResult> = getSubscriptionStatus({ userId }).catch(
        () => ({ status: 'NONE' } as SubscriptionStatusResult)
      )
      const balancePromise: Promise<GetBalanceOutput> = getBalance({ userId }).catch(
        () => ({ totalSummary: { total: 0, used: 0, frozen: 0, available: 0 }, accounts: [] } as GetBalanceOutput)
      )
      const userPromise = ctx.db.user
        .findUnique({
          where: { id: userId },
          select: { hasPurchased: true },
        })
        .catch(() => null)
      const everSubscribedPromise = ctx.db.userSubscriptionCycle
        .findFirst({
          // “订阅过”：出现过任意 REGULAR 周期（不要求未过期）
          where: {
            type: 'REGULAR',
            status: { in: ['ACTIVE', 'CLOSED'] },
            subscription: { userId },
          },
          select: { id: true },
        })
        .catch(() => null)
      const userStatsPromise = ctx.db.userStats
        .findUnique({
          where: { userId },
          select: { totalPaidCents: true },
        })
        .catch(() => null)

      const [subStatus, balance, user, everSubscribed, userStats] = await Promise.all([
        subPromise,
        balancePromise,
        userPromise,
        everSubscribedPromise,
        userStatsPromise,
      ])

      const currentCycle = subStatus.currentCycle
      const hasActive = !!currentCycle

      // 默认：无订阅
      let tier: 'FREE' | 'STARTER' | 'PLUS' | 'PREMIUM' = 'FREE'
      let interval: 'MONTH' | 'YEAR' | 'WEEK' | null = null

      // Relationship status (contract) - default: none
      let subscriptionStatus:
        | 'NONE'
        | 'UNDEFINED'
        | 'INCOMPLETE'
        | 'INCOMPLETE_EXPIRED'
        | 'TRIALING'
        | 'ACTIVE'
        | 'PAST_DUE'
        | 'UNPAID'
        | 'PAUSED'
        | 'CANCELED' = subStatus.status
      let subscriptionTier: 'STARTER' | 'PLUS' | 'PREMIUM' | null = null
      let cancelAtPeriodEnd = false

      // If we have a subscription relationship, fetch plan + cancellation flags for UI.
      // This is intentionally independent from currentCycle so Billing page can still show
      // "renewing"/"payment issue" states without falling back to "Free".
      if (subStatus.subscriptionId) {
        const userSub = await ctx.db.userSubscription.findUnique({
          where: { id: subStatus.subscriptionId },
          select: { planId: true, status: true, cancelAtPeriodEnd: true, planSnapshot: true },
        })

        if (userSub) {
          subscriptionStatus = userSub.status ?? subscriptionStatus
          cancelAtPeriodEnd = !!userSub.cancelAtPeriodEnd

          // Fallback: if plan lookup fails or plan is missing, try to infer tier from snapshot.
          // This avoids UI mislabeling when the subscription relationship exists but planId is invalid.
          const snapshot = userSub.planSnapshot as unknown as {
            type?: string
            planType?: string
            productSubscription?: { plan?: { type?: string; planType?: string } }
          } | null
          const snapshotTypeRaw =
            snapshot?.productSubscription?.plan?.type ??
            snapshot?.productSubscription?.plan?.planType ??
            snapshot?.planType ??
            snapshot?.type
          const snapshotType = typeof snapshotTypeRaw === 'string' ? snapshotTypeRaw.toUpperCase() : ''
          if (snapshotType === 'STARTER' || snapshotType === 'PLUS' || snapshotType === 'PREMIUM') {
            subscriptionTier = snapshotType
          }

          if (userSub.planId) {
            const plan = await ctx.db.subscriptionPlan.findUnique({
              where: { id: userSub.planId },
              select: { type: true, interval: true },
            })

            if (plan?.type === 'STARTER' || plan?.type === 'PLUS' || plan?.type === 'PREMIUM') {
              subscriptionTier = plan.type
            }

            // Only set entitlement tier/interval when the current cycle is active (benefits available).
            if (hasActive && plan) {
              if (plan.interval === 'MONTH' || plan.interval === 'YEAR' || plan.interval === 'WEEK') {
                interval = plan.interval
              }
              if (plan.type === 'STARTER') tier = 'STARTER'
              else if (plan.type === 'PREMIUM') tier = 'PREMIUM'
              else if (plan.type === 'PLUS') tier = 'PLUS'
              else tier = 'PLUS'
            }
          }

          // If we have an active cycle but no plan found, conservatively treat as PLUS for entitlements.
          if (hasActive && tier === 'FREE') {
            tier = 'PLUS'
          }
        }
      }

      const isTrial = currentCycle?.type === 'TRIAL'
      const totalPaidCents = userStats?.totalPaidCents ?? 0
      const hasEverSubscribed = !!everSubscribed

      return {
        tier,
        hasPurchased: user?.hasPurchased ?? false,
        hasEverSubscribed,
        interval,
        expiresAt: currentCycle?.expiresAt ?? null,
        creditsBalance: balance.totalSummary.available,
        cycleType: currentCycle?.type ?? null,
        trialEndsAt: isTrial ? currentCycle.expiresAt : null,
        subscriptionStatus,
        subscriptionTier,
        cancelAtPeriodEnd,
        totalPaidCents,
      }
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        timezone: true,
        countryCode: true,
        countryCodeSource: true,
        isAdmin: true,
        paymentGatewayPreference: true,
      },
    })
    return user
  }),

  getPaymentGatewayPreference: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { paymentGatewayPreference: true },
    })
    return { preference: user?.paymentGatewayPreference ?? 'AUTO' }
  }),

  setPaymentGatewayPreference: protectedProcedure
    .input(
      z.object({
        preference: z.enum(['AUTO', 'STRIPE', 'LEMONSQUEEZY', 'TELEGRAM_STARS', 'NOWPAYMENTS']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ctx.db.user.update({
        where: { id: userId },
        data: { paymentGatewayPreference: input.preference },
      })
      return { success: true }
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required').max(100).optional(),
        image: z.string().url('Invalid image URL').optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          image: input.image,
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          timezone: true,
          paymentGatewayPreference: true,
        },
      })
      return { success: true, user: updatedUser }
    }),

  updateTimezone: protectedProcedure
    .input(
      z.object({
        timezone: z.string().min(1, 'Timezone is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ctx.db.user.update({
        where: { id: userId },
        data: { timezone: input.timezone },
      })
      return { success: true }
    }),

  /**
   * Auto-update user's country code from request headers (Cloudflare/Vercel).
   * Only updates if user has no country code set yet.
   * Country code is NOT user-modifiable (for tax/compliance reasons).
   */
  autoUpdateGeo: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    
    // Check if user already has a country code
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { countryCode: true },
    })
    
    // If already set, don't override (country code is immutable once set)
    if (user?.countryCode) {
      return { success: true, countryCode: user.countryCode, updated: false }
    }
    
    // Extract country from request headers
    const headers = ctx.headers
    const countryCode = getClientCountryFromHeaders(headers)
    
    if (!countryCode) {
      return { success: false, countryCode: null, updated: false }
    }
    
    // Save to database
    await ctx.db.user.update({
      where: { id: userId },
      data: {
        countryCode,
        countryCodeSource: 'AUTO',
        countryCodeUpdatedAt: new Date(),
      },
    })
    
    return { success: true, countryCode, updated: true }
  }),

  /**
   * Delete account - blocks the user and invalidates all sessions.
   * Data purge will be handled separately.
   */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id

    await ctx.db.$transaction([
      ctx.db.user.update({
        where: { id: userId },
        data: { 
          isBlocked: true,
          blockedReason: "USER_REQUESTED",
          blockedAt: new Date(),
        },
      }),
      ctx.db.session.deleteMany({ where: { userId } }),
    ])

    return { success: true }
  }),
})

export type BillingStatus = z.infer<typeof BillingStatusSchema>

