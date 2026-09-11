import { z } from "zod";
import { adminProcedure } from "@/server/api/trpc";
import type { Prisma } from "@prisma/client";

export const listUsers = adminProcedure
  .input(
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      status: z.enum(["all", "active", "blocked"]).default("all"),
      isPrimary: z.enum(["all", "yes", "no"]).default("all"),
      hasPurchased: z.enum(["all", "yes", "no"]).default("all"),
      isAdmin: z.enum(["all", "yes", "no"]).default("all"),
      utmSource: z.string().optional(),
      countryCode: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
  )
  .query(async ({ ctx, input }) => {
    const { page, pageSize, search, status, isPrimary, hasPurchased, isAdmin, utmSource, countryCode, dateFrom, dateTo, sortBy, sortOrder } = input;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.isBlocked = false;
    if (status === "blocked") where.isBlocked = true;

    if (isPrimary === "yes") where.isPrimaryDeviceAccount = true;
    if (isPrimary === "no") where.isPrimaryDeviceAccount = false;

    if (hasPurchased === "yes") where.hasPurchased = true;
    if (hasPurchased === "no") where.hasPurchased = false;

    if (isAdmin === "yes") where.isAdmin = true;
    if (isAdmin === "no") where.isAdmin = false;

    if (utmSource) {
      where.utmSource = { contains: utmSource, mode: "insensitive" };
    }

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const total = await ctx.db.user.count({ where });

    const items = await ctx.db.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const getUtmSources = adminProcedure.query(async ({ ctx }) => {
  const sources = await ctx.db.user.findMany({
    where: { utmSource: { not: null } },
    select: { utmSource: true },
    distinct: ["utmSource"],
    orderBy: { utmSource: "asc" },
  });
  return sources.map((s) => s.utmSource).filter(Boolean) as string[];
});

export const getCountryCodes = adminProcedure.query(async ({ ctx }) => {
  const countries = await ctx.db.user.findMany({
    where: { countryCode: { not: null } },
    select: { countryCode: true },
    distinct: ["countryCode"],
    orderBy: { countryCode: "asc" },
  });
  return countries.map((c) => c.countryCode).filter(Boolean) as string[];
});

export const getUser = adminProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.userId },
      include: {
        stats: true,
        referredBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    if (!user) return null;

    const subscription = await ctx.db.userSubscription.findFirst({
      where: {
        userId: input.userId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: {
        cycles: {
          where: { status: "ACTIVE", deletedAt: null, startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } },
          orderBy: { sequenceNumber: "desc" },
          take: 1,
        },
      },
    });

    const [account, referralsCount, payoutRequests] = await Promise.all([
      ctx.db.affiliateAccount.findUnique({
        where: { userId: input.userId },
        select: {
          pendingCents: true,
          availableCents: true,
          lockedCents: true,
          debtCents: true,
        },
      }),
      ctx.db.user.count({
        where: { referredById: input.userId },
      }),
      ctx.db.affiliatePayoutRequest.findMany({
        where: { affiliateUserId: input.userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          amountCents: true,
          walletAddress: true,
          txHash: true,
          createdAt: true,
        },
      }),
    ]);

    const affiliateBalances = {
      pendingCents: account?.pendingCents ?? 0,
      availableCents: account?.availableCents ?? 0,
      lockedCents: account?.lockedCents ?? 0,
      debtCents: account?.debtCents ?? 0,
    };

    return {
      ...user,
      subscription: subscription
        ? {
            id: subscription.id,
            planSnapshot: subscription.planSnapshot as { name?: string; type?: string },
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentCycle: subscription.cycles[0] ?? null,
          }
        : null,
      affiliate: {
        referralCode: user.referralCode,
        payoutWallet: user.payoutWallet,
        affiliateEnabledAt: user.affiliateEnabledAt,
        referredBy: user.referredBy,
        referralsCount,
        balances: affiliateBalances,
        payoutRequests,
      },
    };
  });

export const getRelatedUsers = adminProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.userId },
      select: { deviceKeyAtSignup: true },
    });

    if (!user?.deviceKeyAtSignup) {
      return [];
    }

    const relatedUsers = await ctx.db.user.findMany({
      where: {
        deviceKeyAtSignup: user.deviceKeyAtSignup,
        id: { not: input.userId },
      },
      orderBy: { createdAt: "asc" },
    });

    return relatedUsers;
  });

export const blockUser = adminProcedure
  .input(z.object({ userId: z.string(), reason: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.$transaction([
      ctx.db.user.update({
        where: { id: input.userId },
        data: { 
          isBlocked: true,
          blockedReason: "ADMIN_MANUAL",
          blockedAt: new Date(),
        },
      }),
      ctx.db.session.deleteMany({
        where: { userId: input.userId },
      }),
    ]);
    return { success: true };
  });

export const unblockUser = adminProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.user.update({
      where: { id: input.userId },
      data: { 
        isBlocked: false,
        blockedReason: null,
        blockedAt: null,
      },
    });
    return { success: true };
  });

export const setBlurBypass = adminProcedure
  .input(z.object({ userId: z.string(), enabled: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.userStats.upsert({
      where: { userId: input.userId },
      update: { canBypassBlur: input.enabled },
      create: { userId: input.userId, canBypassBlur: input.enabled },
    });
    return { success: true };
  });

export const deleteUser = adminProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.$transaction(async (tx) => {
      await tx.userSubscriptionCycle.deleteMany({ where: { subscription: { userId: input.userId } } });
      await tx.userSubscription.deleteMany({ where: { userId: input.userId } });

      await tx.payment.deleteMany({ where: { order: { userId: input.userId } } });
      await tx.order.deleteMany({ where: { userId: input.userId } });

      await tx.session.deleteMany({ where: { userId: input.userId } });
      await tx.account.deleteMany({ where: { userId: input.userId } });

      await tx.user.delete({ where: { id: input.userId } });
    });
    return { success: true };
  });
