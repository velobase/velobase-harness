import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import {
  createProductCatalog,
  currencySchema,
  supportedCurrencies,
  ProductCatalogError,
  type CatalogRepository,
  type CatalogProduct,
  type ProductCurrency,
  type ProductPrice,
} from "@velobase/products";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";
import { updateHostProductSchema } from "./schema";
export { updateHostProductSchema } from "./schema";

type Row = Prisma.ProductGetPayload<{ include: { prices: true } }>;
export type HostCatalogProduct = Omit<Row, "currency" | "prices"> &
  CatalogProduct;
function product(row: Row): HostCatalogProduct {
  const prices = new Map<ProductCurrency, ProductPrice>();
  for (const price of row.prices) {
    const currency = currencySchema.safeParse(price.currency.toUpperCase());
    if (
      currency.success &&
      currency.data !== "USD" &&
      (!prices.has(currency.data) || price.currency === currency.data)
    ) {
      prices.set(currency.data, {
        currency: currency.data,
        amount: price.amount,
        originalAmount: price.originalAmount,
      });
    }
  }
  return {
    ...row,
    currency: "USD",
    revision: row.updatedAt.toISOString(),
    // The legacy schema defines Product.price as USD, irrespective of its compatibility currency field.
    prices: [...prices.values()],
  };
}
function catalogFor(transaction?: Prisma.TransactionClient, enabled?: boolean) {
  const client = transaction ?? db;
  async function atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return transaction ? work(transaction) : db.$transaction(work);
  }
  const repository: CatalogRepository<HostCatalogProduct> = {
    async get(id) {
      const row = await client.product.findUnique({
        where: { id },
        include: { prices: true },
      });
      return row ? product(row) : null;
    },
    async create({ prices, ...data }) {
      // A catalog-only draft has no fulfillment binding. The host's commerce creator supplies typed bindings.
      if (data.currency !== "USD")
        throw new ProductCatalogError(
          "BAD_REQUEST",
          "This host uses USD for its base price",
        );
      return product(
        await client.product.create({
          data: { ...data, type: "UNDEFINED", prices: { create: prices } },
          include: { prices: true },
        }),
      );
    },
    async update(id, revision, change) {
      if (change.currency && change.currency !== "USD")
        throw new ProductCatalogError(
          "BAD_REQUEST",
          "This host uses USD for its base price",
        );
      const updatedAt = new Date(z.string().datetime().parse(revision));
      return atomic(async (tx) => {
        const { prices, ...data } = change;
        const changed = await tx.product.updateMany({
          where: { id, updatedAt, deletedAt: null },
          data: {
            ...data,
            updatedAt: new Date(Math.max(Date.now(), updatedAt.getTime() + 1)),
          },
        });
        if (changed.count !== 1) return null;
        if (prices !== undefined) {
          // Keep legacy currencies that this editor cannot represent, including the unused USD row.
          await tx.productPrice.deleteMany({
            where: {
              productId: id,
              OR: supportedCurrencies
                .filter((currency) => currency !== "USD")
                .map((currency) => ({
                  currency: { equals: currency, mode: "insensitive" as const },
                })),
            },
          });
          if (prices.length)
            await tx.productPrice.createMany({
              data: prices.map((price) => ({ ...price, productId: id })),
            });
        }
        return product(
          await tx.product.findUniqueOrThrow({
            where: { id },
            include: { prices: true },
          }),
        );
      });
    },
    async list(input) {
      const rows = await client.product.findMany({
        where: {
          ...(input.publicOnly
            ? { status: "ACTIVE", isAvailable: true, deletedAt: null }
            : !input.includeArchived
              ? { deletedAt: null }
              : {}),
          ...(input.search
            ? { name: { contains: input.search, mode: "insensitive" } }
            : {}),
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { prices: true },
      });
      return {
        items: rows.slice(0, input.limit).map(product),
        nextCursor:
          rows.length > input.limit ? rows[input.limit - 1]?.id : undefined,
      };
    },
  };
  return createProductCatalog({
    repository,
    isEnabled: () =>
      enabled === undefined
        ? isFeatureEnabled("products")
        : Promise.resolve(enabled),
  });
}
export const productCatalog = catalogFor();
export async function productOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProductCatalogError)
      throw new TRPCError({
        code: error.code === "UNAVAILABLE" ? "FORBIDDEN" : error.code,
        message: error.message,
        cause: error,
      });
    if (error instanceof z.ZodError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error,
      });
    throw error;
  }
}

/** Subscription/credit-package fields are explicit host extensions, outside the catalog package. */
export async function updateHostProduct(input: unknown) {
  const {
    productId,
    revision,
    hasTrial,
    trialDays,
    trialCreditsAmount,
    creditsPerMonth,
    creditsAmount,
    ...details
  } = updateHostProductSchema.parse(input);
  // Read before acquiring the transaction's connection; this also works with a one-connection pool.
  const enabled = await isFeatureEnabled("products");
  return productOperation(() =>
    db.$transaction(async (tx) => {
      const saved = await catalogFor(tx, enabled).update(
        productId,
        details,
        revision,
      );
      if (
        hasTrial !== undefined ||
        trialDays !== undefined ||
        trialCreditsAmount !== undefined
      ) {
        await tx.product.update({
          where: { id: productId },
          data: {
            hasTrial,
            trialDays,
            trialCreditsAmount,
            updatedAt: new Date(saved.revision),
          },
        });
      }
      if (creditsPerMonth !== undefined) {
        const subscription = await tx.productSubscription.findUnique({
          where: { productId },
        });
        if (!subscription)
          throw new ProductCatalogError(
            "BAD_REQUEST",
            "Product has no subscription binding",
          );
        await tx.subscriptionPlan.update({
          where: { id: subscription.planId },
          data: { creditsPerPeriod: creditsPerMonth, creditsPerMonth },
        });
      }
      if (creditsAmount !== undefined) {
        const count = await tx.productCreditsPackage.updateMany({
          where: { productId },
          data: { creditsAmount },
        });
        if (count.count !== 1)
          throw new ProductCatalogError(
            "BAD_REQUEST",
            "Product has no credits package binding",
          );
      }
      return tx.product.findUniqueOrThrow({ where: { id: productId } });
    }),
  );
}
export async function toggleHostProductAvailability(
  productId: string,
  expectedRevision?: string,
  available?: boolean,
) {
  return productOperation(async () => {
    const product = await productCatalog.getForAdmin(productId);
    return productCatalog.update(
      productId,
      { isAvailable: available ?? !product.isAvailable },
      expectedRevision ?? product.revision,
    );
  });
}
