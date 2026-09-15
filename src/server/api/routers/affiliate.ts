import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "@prisma/client";

import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  getAffiliateAccountBalances,
  matureAffiliateEarningsForUser,
  requestAffiliateCashout,
} from "@/server/affiliate/services/ledger";

import {
  exchangeInput,
  exchangeAffiliateCredits,
  pendingExchange,
} from "@/modules/affiliate/server/credits-extension";

const MIN_ELIGIBLE_TOTAL_PAID_CENTS = 499; // $4.99
const MIN_CASHOUT_CENTS = 5000; // $50.00
const EXCHANGE_UNIT_CENTS = 100; // $1.00
const EXCHANGE_UNIT_CREDITS = 500;

function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

type Db = PrismaClient;

async function getTotalPaidCents(ctx: {
  db: Db;
  userId: string;
}): Promise<number> {
  const stats = await ctx.db.userStats.findUnique({
    where: { userId: ctx.userId },
    select: { totalPaidCents: true },
  });
  return stats?.totalPaidCents ?? 0;
}

async function ensureReferralCode(ctx: {
  db: Db;
  userId: string;
}): Promise<string> {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  // Generate lazily; retry on unique collisions
  for (let i = 0; i < 5; i++) {
    const code = createId().slice(0, 10).toUpperCase();
    try {
      const updated = await ctx.db.user.update({
        where: { id: ctx.userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      if (updated.referralCode) return updated.referralCode;
    } catch {
      // collision; retry
    }
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to generate referral code",
  });
}

const affiliateRequiredProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const totalPaidCents = await getTotalPaidCents({
      db: ctx.db,
      userId: ctx.session.user.id,
    });
    if (totalPaidCents < MIN_ELIGIBLE_TOTAL_PAID_CENTS) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not eligible" });
    }
    return next();
  },
);

export const affiliateRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const totalPaidCents = await getTotalPaidCents({ db: ctx.db, userId });
    const canActivate = totalPaidCents >= MIN_ELIGIBLE_TOTAL_PAID_CENTS;

    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        payoutWallet: true,
        affiliateEnabledAt: true,
      },
    });

    const referralCode: string | null = user?.referralCode ?? null;

    const [balances, pendingCreditExchange] = await Promise.all([
      getAffiliateAccountBalances(userId),
      pendingExchange(userId),
    ]);
    const eligible =
      canActivate ||
      Boolean(user?.affiliateEnabledAt) ||
      Object.values(balances).some((amount) => amount > 0);

    const base = env.APP_URL ?? "";
    const referralLink = referralCode
      ? `${base}/?ref=${encodeURIComponent(referralCode)}`
      : null;

    return {
      eligible,
      canActivate,
      pendingCreditExchange,
      totalPaidCents,
      referralCode,
      referralLink,
      payoutWallet: user?.payoutWallet ?? null,
      balances,
      rules: {
        minCashoutCents: MIN_CASHOUT_CENTS,
        exchangeUnitCents: EXCHANGE_UNIT_CENTS,
        exchangeUnitCredits: EXCHANGE_UNIT_CREDITS,
        chain: "polygon",
        token: "usdt",
      },
    };
  }),

  activate: affiliateRequiredProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // 1. Mark enabled time once
    await ctx.db.user.updateMany({
      where: { id: userId, affiliateEnabledAt: null },
      data: { affiliateEnabledAt: new Date() },
    });

    // 2. Generate referral code
    const referralCode = await ensureReferralCode({ db: ctx.db, userId });

    return { referralCode };
  }),

  updatePayoutWallet: protectedProcedure
    .input(z.object({ walletAddress: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const addr = input.walletAddress;
      if (!isEvmAddress(addr)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid Polygon address",
        });
      }

      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { payoutWallet: addr },
      });

      return { ok: true };
    }),

  listCommissions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await matureAffiliateEarningsForUser(userId);

      const limit = input.limit;
      const items = await ctx.db.affiliateEarning.findMany({
        where: { affiliateUserId: userId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        select: {
          id: true,
          sourceType: true,
          sourceExternalId: true,
          paymentGateway: true,
          grossAmountCents: true,
          commissionRateBps: true,
          commissionCents: true,
          state: true,
          availableAt: true,
          orderId: true,
          paymentId: true,
          subscriptionId: true,
          createdAt: true,
          referredUser: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return { items, nextCursor };
    }),

  requestCashout: protectedProcedure
    .input(
      z.object({
        amountCents: z.number().int().min(MIN_CASHOUT_CENTS),
        walletAddress: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Validate wallet address format
      if (!isEvmAddress(input.walletAddress)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid Polygon address",
        });
      }

      const { requestId } = await requestAffiliateCashout({
        userId,
        amountCents: input.amountCents,
        walletAddress: input.walletAddress,
      });

      return { ok: true, requestId };
    }),

  pendingExchange: protectedProcedure.query(({ ctx }) =>
    pendingExchange(ctx.session.user.id),
  ),

  exchangeCredits: protectedProcedure
    .input(exchangeInput)
    .mutation(({ ctx, input }) =>
      exchangeAffiliateCredits(ctx.session.user.id, input),
    ),
});
