import { selectProductPrice } from "@velobase/products";
import { isFeatureEnabled } from "@/server/features/state";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { db } from "@/server/db";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";
import { getBalance } from "@/server/billing/services/get-balance";
import type { ProductType } from "@prisma/client";
import type { SubscriptionStatusResult } from "@/server/membership/types";
import { getNewUserUnlockOffer } from "@/server/offers/services/get-new-user-unlock-offer";
import { resolveClientCountryCode } from "@/server/lib/resolve-client-country";
import { getCurrencyForCountry } from "./get-price-for-currency";
import {
  formatPrice,
  calculateDiscount,
  formatUnitPrice,
  extractPlanFeatures,
} from "../utils/format-price";

export interface ListForPricingParams {
  type?: ProductType;
  productIds?: string[];
  limit?: number;
  offset?: number;
  userId?: string; // Optional: if provided, return user-specific data
  headers?: Headers; // Optional: for geo-based currency display
}

export interface ProductItem {
  id: string;
  name: string;
  description: unknown;
  price: number;
  originalPrice: number;
  displayPrice: string;
  currency: string;
  type: ProductType;
  interval?: string | null;
  status: string;
  isAvailable: boolean;
  sortOrder: number;

  // Metadata (for AB testing, etc.)
  metadata?: unknown;

  // Calculated fields
  discount?: number;

  // Subscription specific
  creditsPerMonth?: number;
  features?: string[];
  planType?: "FREE" | "STARTER" | "PLUS" | "PREMIUM"; // Subscription plan tier

  // Pre-calculated display prices for subscriptions (with correct currency symbol)
  // These are server-computed to avoid hardcoded $ on frontend
  monthlyDisplayPrice?: string; // Monthly equivalent price, e.g. "£16.00" for yearly plans
  yearlyDisplayPrice?: string; // Yearly total, e.g. "Billed £192.00 yearly"

  // Trial specific (for subscription products)
  hasTrial?: boolean;
  trialDays?: number | null;
  trialCreditsAmount?: number | null;

  // Credits package specific
  creditsAmount?: number;
  unitPrice?: string;

  // User specific (only when userId provided)
  isPurchasable?: boolean;
  userStatus?: {
    hasActiveSubscription: boolean;
    currentBalance: number;
  };

  // Raw relations
  productSubscription?: unknown;
  creditsPackage?: unknown;
  oneTimeEntitlements?: unknown[];

  // Purchase mode for UI: NEW / UPGRADE / DISABLED
  purchaseMode?: "NEW" | "UPGRADE" | "DISABLED";
}

export interface ListForPricingOutput {
  products: ProductItem[];
  total: number;
  hasMore: boolean;
  /**
   * New user countdown (optional, only when userId provided and eligible).
   * Used for limited-time UX like "offer ends in 30 min".
   */
  newUserOffer?: {
    state: "ACTIVE" | "EXPIRED" | "CONSUMED" | "INELIGIBLE";
    endsAt: Date | null;
    startedAt: Date | null;
  };
}

export async function listForPricing({
  type,
  productIds,
  limit = 10,
  offset = 0,
  userId,
  headers,
}: ListForPricingParams): Promise<ListForPricingOutput> {
  const [offersEnabled, creditsEnabled, subscriptionsEnabled, paymentsEnabled] =
    await Promise.all([
      isFeatureEnabled("newcomer-offers"),
      isFeatureEnabled("credits"),
      isFeatureEnabled("subscriptions"),
      isFeatureEnabled("payments"),
    ]);
  // Build query
  const where = {
    ...(productIds && productIds.length > 0 ? { id: { in: productIds } } : {}),
    ...(type && type !== "UNDEFINED" && !(productIds && productIds.length > 0)
      ? { type }
      : {}),
    ...(!offersEnabled
      ? { NOT: { id: NEW_USER_UNLOCK_OFFER.discountedProductId } }
      : {}),
    status: "ACTIVE" as const,
    isAvailable: true,
    deletedAt: null,
  };

  // Fetch products
  const products = await db.product.findMany({
    where,
    orderBy:
      productIds && productIds.length > 0
        ? [{ sortOrder: "asc" }]
        : [{ sortOrder: "asc" }, { type: "asc" }, { price: "asc" }],
    take: productIds && productIds.length > 0 ? undefined : limit,
    skip: productIds && productIds.length > 0 ? undefined : offset,
    include: {
      productSubscription: {
        include: {
          plan: {
            include: {
              planEntitlements: {
                include: {
                  entitlement: true,
                },
              },
            },
          },
        },
      },
      creditsPackage: true,
      oneTimeEntitlements: {
        include: {
          entitlement: true,
        },
      },
    },
  });

  // If productIds is provided, return in the same order as requested (stable UX).
  const orderedProducts =
    productIds && productIds.length > 0
      ? (() => {
          const index = new Map(productIds.map((id, i) => [id, i] as const));
          return [...products].sort(
            (a, b) => (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9),
          );
        })()
      : products;

  const total =
    productIds && productIds.length > 0
      ? orderedProducts.length
      : await db.product.count({ where });

  // =====================================================================
  // Multi-currency display (pricing page):
  // - Priority: request headers > user's stored countryCode (best-effort)
  // - Fetch localized prices for the current page in one query
  // =====================================================================
  let storedCountryCode: string | null = null;

  // If logged in, use user's stored countryCode first
  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { countryCode: true },
    });
    storedCountryCode = user?.countryCode ?? null;
  }

  const resolved = resolveClientCountryCode({
    headers: headers ?? null,
    storedCountryCode,
  });
  const preferredCurrency = getCurrencyForCountry(resolved.countryCode); // "USD" | "EUR" | "GBP" | "CHF" | "AUD"

  const localizedPriceMap = new Map<
    string,
    { amount: number; originalAmount: number }
  >();
  if (preferredCurrency !== "USD" && orderedProducts.length > 0) {
    const rows = await db.productPrice.findMany({
      where: {
        productId: { in: orderedProducts.map((p) => p.id) },
        currency: preferredCurrency,
      },
      select: { productId: true, amount: true, originalAmount: true },
    });
    for (const r of rows) {
      localizedPriceMap.set(r.productId, {
        amount: r.amount,
        originalAmount: r.originalAmount,
      });
    }
  }

  // Fetch user data if logged in
  let hasActiveSubscription = false;
  let currentBalance = 0;
  let currentPlanType: string | null = null;
  let newUserOfferData:
    | {
        state: "ACTIVE" | "EXPIRED" | "CONSUMED" | "INELIGIBLE";
        endsAt: Date | null;
        startedAt: Date | null;
      }
    | undefined;

  if (userId) {
    const [rawSubStatus, balanceData, user, offer] = await Promise.all([
      getSubscriptionStatus({ userId }).catch(
        () => ({ status: "NONE" }) as SubscriptionStatusResult,
      ),
      creditsEnabled
        ? getBalance({ userId }).catch(() => null)
        : Promise.resolve(null),
      db.user.findUnique({
        where: { id: userId },
        select: { createdAt: true, hasPurchased: true },
      }),
      getNewUserUnlockOffer({ userId }).catch(() => null),
    ]);

    const subStatus = rawSubStatus;

    hasActiveSubscription = !!subStatus.currentCycle;
    currentBalance = balanceData?.totalSummary.available ?? 0;

    // New user offer: show if no active subscription (buying credits pack shouldn't hide the offer)
    if (user && !hasActiveSubscription && offer) {
      newUserOfferData = {
        state: offer.state,
        endsAt: offer.endsAt ?? null,
        startedAt: offer.startedAt ?? null,
      };
    }

    if (subStatus.subscriptionId) {
      const userSub = await db.userSubscription.findUnique({
        where: { id: subStatus.subscriptionId },
        select: { planId: true },
      });

      if (userSub?.planId) {
        const plan = await db.subscriptionPlan.findUnique({
          where: { id: userSub.planId },
          select: { type: true },
        });
        currentPlanType = plan?.type ?? null;
      }
    }
  }

  // Transform products
  const productItems: ProductItem[] = orderedProducts.map((product) => {
    const localized =
      preferredCurrency !== "USD"
        ? localizedPriceMap.get(product.id)
        : undefined;
    const selectedPrice = selectProductPrice(
      {
        currency: "USD",
        amount: product.price,
        originalAmount: product.originalPrice,
      },
      localized ? [{ ...localized, currency: preferredCurrency }] : [],
      preferredCurrency,
    );
    const currencyLower = selectedPrice.currency.toLowerCase();
    const displayPriceCents = selectedPrice.amount;
    const displayOriginalPriceCents = selectedPrice.originalAmount;

    const item: ProductItem = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: displayPriceCents,
      originalPrice: displayOriginalPriceCents,
      currency: currencyLower,
      type: product.type,
      interval: product.interval,
      status: product.status,
      isAvailable: product.isAvailable,
      sortOrder: product.sortOrder,
      metadata: product.metadata,
      displayPrice: "",
      productSubscription: product.productSubscription,
      creditsPackage: product.creditsPackage,
      oneTimeEntitlements: product.oneTimeEntitlements,
    };

    // Calculate discount
    if (item.originalPrice > item.price) {
      item.discount = calculateDiscount(item.originalPrice, item.price);
    }

    // Type-specific fields
    if (product.type === "SUBSCRIPTION" && product.productSubscription) {
      const plan = product.productSubscription.plan;
      // 优先使用 creditsPerPeriod，兼容 creditsPerMonth
      const creditsPerPeriod = plan.creditsPerPeriod || plan.creditsPerMonth;
      item.creditsPerMonth = creditsPerPeriod; // Keep field name for API compatibility
      item.planType = plan.type as ProductItem["planType"]; // Expose plan tier (FREE/STARTER/PLUS/PREMIUM)
      item.features = extractPlanFeatures({
        creditsPerMonth: creditsPerPeriod,
        planEntitlements: plan.planEntitlements,
      });

      // Calculate display price (formatted number only, no period suffix)
      // For yearly plans, we typically show the monthly equivalent price
      // Note: product.interval is lowercase ('year', 'month', 'week') from database
      if (product.interval === "year") {
        const monthlyCents = Math.floor(item.price / 12);
        item.displayPrice = formatPrice(monthlyCents, {
          currency: item.currency,
        });
        item.monthlyDisplayPrice = formatPrice(monthlyCents, {
          currency: item.currency,
        });
        item.yearlyDisplayPrice = `Billed ${formatPrice(item.price, { currency: item.currency })} yearly`;
      } else if (product.interval === "week") {
        // Weekly subscription (e.g., Starter plan)
        item.displayPrice = formatPrice(item.price, {
          currency: item.currency,
        });
        // No monthly equivalent for weekly plans
      } else {
        // Monthly subscription
        item.displayPrice = formatPrice(item.price, {
          currency: item.currency,
        });
        item.monthlyDisplayPrice = formatPrice(item.price, {
          currency: item.currency,
        });
      }

      // Trial fields
      item.hasTrial = product.hasTrial;
      item.trialDays = product.trialDays;
      item.trialCreditsAmount = product.trialCreditsAmount;
    } else if (product.type === "CREDITS_PACKAGE" && product.creditsPackage) {
      item.creditsAmount = product.creditsPackage.creditsAmount;
      item.unitPrice = formatUnitPrice(
        item.price,
        product.creditsPackage.creditsAmount,
        { currency: item.currency },
      );
      item.displayPrice = formatPrice(item.price, { currency: item.currency });
    } else {
      // Fallback for other types
      item.displayPrice = formatPrice(item.price, { currency: item.currency });
    }

    // Determine purchase mode & user-specific fields (only when logged in)
    if (userId) {
      // 默认：未登录或无订阅时，订阅商品为 NEW，积分包始终为 NEW
      if (product.type === "SUBSCRIPTION") {
        const targetPlanType =
          product.productSubscription &&
          (product.productSubscription as { plan?: { type?: string } | null })
            .plan &&
          (
            (product.productSubscription as { plan?: { type?: string } | null })
              .plan as {
              type?: string;
            }
          ).type;

        if (!hasActiveSubscription) {
          item.purchaseMode = "NEW";
          item.isPurchasable = true;
        } else {
          const fromType = currentPlanType;

          const isUpgrade =
            fromType === "STARTER" &&
            (targetPlanType === "PLUS" || targetPlanType === "PREMIUM");

          if (isUpgrade) {
            item.purchaseMode = "UPGRADE";
            item.isPurchasable = true;
          } else {
            // 已有订阅且非升级目标：前端应引导至「管理订阅」而非再次下单
            item.purchaseMode = "DISABLED";
            item.isPurchasable = false;
          }
        }
      } else {
        // Credits packages are always purchasable
        item.purchaseMode = "NEW";
        item.isPurchasable = true;
      }

      item.userStatus = {
        hasActiveSubscription,
        currentBalance,
      };
    }

    if (
      product.type === "UNDEFINED" ||
      !paymentsEnabled ||
      (product.type === "SUBSCRIPTION" && !subscriptionsEnabled) ||
      (product.type === "CREDITS_PACKAGE" && !creditsEnabled)
    ) {
      item.isPurchasable = false;
      item.purchaseMode = "DISABLED";
    }
    return item;
  });

  return {
    products: productItems,
    total,
    hasMore:
      productIds && productIds.length > 0
        ? false
        : offset + products.length < total,
    ...(newUserOfferData ? { newUserOffer: newUserOfferData } : {}),
  };
}
