import { db } from "@/server/db";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";
import { isFeatureEnabled } from "@/server/features/state";
import type { Product, Prisma } from "@prisma/client";

export interface ListUserAvailableParams {
  userId: string;
  type?: Product["type"];
  limit?: number;
  offset?: number;
}

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    productSubscription: { include: { plan: true } };
    creditsPackage: true;
    oneTimeEntitlements: true;
  };
}>;

export async function listUserAvailableProducts({
  userId,
  type,
  limit = 10,
  offset = 0,
}: ListUserAvailableParams) {
  const [sub, paymentsEnabled, subscriptionsEnabled, creditsEnabled] =
    await Promise.all([
      getSubscriptionStatus({ userId }),
      isFeatureEnabled("payments"),
      isFeatureEnabled("subscriptions"),
      isFeatureEnabled("credits"),
    ]);

  const where = {
    ...(type && { type }),
    status: "ACTIVE" as const,
    isAvailable: true,
    deletedAt: null,
  };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ type: "asc" }, { price: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        productSubscription: { include: { plan: true } },
        creditsPackage: true,
        oneTimeEntitlements: true,
      },
    }),
    db.product.count({ where }),
  ]);

  const productsWithStatus = products.map((p) => ({
    product: p,
    isPurchasable:
      paymentsEnabled &&
      p.type !== "UNDEFINED" &&
      (p.type !== "SUBSCRIPTION" || subscriptionsEnabled) &&
      (p.type !== "CREDITS_PACKAGE" || creditsEnabled) &&
      isPurchasableForUser(p, !!sub.currentCycle),
    priceStr: calculateDisplayPrice(p),
  }));

  return {
    products: productsWithStatus,
    total,
    hasMore: offset + products.length < total,
  };
}

function isPurchasableForUser(
  product: Product,
  hasActiveSubscription: boolean,
) {
  if (product.type === "SUBSCRIPTION") return !hasActiveSubscription;
  return true;
}

function calculateDisplayPrice(product: ProductWithRelations) {
  if (
    product.type === "SUBSCRIPTION" &&
    product.productSubscription?.plan?.interval === "YEAR"
  ) {
    return Math.ceil(product.price / 1200);
  }
  return Math.ceil(product.price / 100);
}
