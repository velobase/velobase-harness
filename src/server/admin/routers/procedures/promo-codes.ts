import { createCampaignInput, updateCampaignInput } from "@velobase/activities";
import {
  createPromoDraft,
  updatePromoActivity,
} from "@/modules/activities/server/promo-admin";
import { z } from "zod";
import { adminProcedure } from "@/server/api/trpc";
import type { Prisma, PromoCodeStatus, PromoGrantType } from "@prisma/client";

export const listPromoCodes = adminProcedure
  .input(
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      status: z
        .enum(["all", "DRAFT", "ACTIVE", "DISABLED", "EXPIRED"])
        .default("all"),
      grantType: z.enum(["all", "CREDIT", "PRODUCT"]).default("all"),
    }),
  )
  .query(async ({ ctx, input }) => {
    const { page, pageSize, search, status, grantType } = input;

    const where: Prisma.PromoCodeWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status !== "all") {
      where.status = status as PromoCodeStatus;
    }

    if (grantType !== "all") {
      where.grantType = grantType as PromoGrantType;
    }

    const total = await ctx.db.promoCode.count({ where });

    const items = await ctx.db.promoCode.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const createPromoCode = adminProcedure
  .input(createCampaignInput)
  .mutation(({ input }) => createPromoDraft(input));

export const updatePromoCode = adminProcedure
  .input(updateCampaignInput)
  .mutation(({ input }) => updatePromoActivity(input));

export const deletePromoCode = adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.promoCode.update({
      where: { id: input.id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  });

export const listPromoRedemptions = adminProcedure
  .input(
    z.object({
      promoCodeId: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.promoCodeRedemption.findMany({
      where: { promoCodeId: input.promoCodeId },
      orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: {
        id: true,
        userId: true,
        creditsGranted: true,
        redeemedAt: true,
      },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const users = await ctx.db.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, email: true },
    });
    const emails = new Map(users.map((user) => [user.id, user.email]));
    const items = rows
      .slice(0, input.limit)
      .map((row) => ({ ...row, email: emails.get(row.userId) ?? null }));
    return {
      items,
      nextCursor: rows.length > input.limit ? items.at(-1)?.id : undefined,
    };
  });
