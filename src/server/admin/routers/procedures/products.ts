import { z } from "zod";
import {
  updateHostProductSchema,
  updateHostProduct,
  toggleHostProductAvailability,
} from "@/modules/products/server/service";
import { adminProcedure } from "@/server/api/trpc";
import type { Prisma, ProductType, ProductStatus } from "@prisma/client";

export const listProducts = adminProcedure
  .input(
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      type: z
        .enum([
          "all",
          "SUBSCRIPTION",
          "CREDITS_PACKAGE",
          "ONE_TIME_ENTITLEMENT",
        ])
        .default("all"),
      status: z.enum(["all", "ACTIVE", "INACTIVE"]).default("all"),
      isAvailable: z.enum(["all", "yes", "no"]).default("all"),
    }),
  )
  .query(async ({ ctx, input }) => {
    const { page, pageSize, search, type, status, isAvailable } = input;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
      ];
    }

    if (type !== "all") {
      where.type = type as ProductType;
    }

    if (status !== "all") {
      where.status = status as ProductStatus;
    }

    if (isAvailable === "yes") where.isAvailable = true;
    if (isAvailable === "no") where.isAvailable = false;

    const total = await ctx.db.product.count({ where });

    const items = await ctx.db.product.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        productSubscription: {
          include: { plan: true },
        },
        creditsPackage: true,
        prices: {
          orderBy: { currency: "asc" },
        },
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

export const getProduct = adminProcedure
  .input(z.object({ productId: z.string() }))
  .query(async ({ ctx, input }) => {
    return ctx.db.product.findUnique({
      where: { id: input.productId },
      include: {
        productSubscription: {
          include: { plan: true },
        },
        creditsPackage: true,
        oneTimeEntitlements: {
          include: { entitlement: true },
        },
      },
    });
  });

export const updateProduct = adminProcedure
  .input(updateHostProductSchema)
  .mutation(({ input }) => updateHostProduct(input));

export const toggleProductAvailability = adminProcedure
  .input(
    z.object({
      productId: z.string().min(1),
      revision: z.string().datetime().optional(),
      isAvailable: z.boolean().optional(),
    }),
  )
  .mutation(({ input }) =>
    toggleHostProductAvailability(
      input.productId,
      input.revision,
      input.isAvailable,
    ),
  );
