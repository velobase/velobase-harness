import { createOrder } from "./create-order";
import { createPayment } from "./create-payment";
import { getProduct } from "@/server/product/services/get";
import type { OrderType } from "../types";
import type { ProductSnapshot } from "../providers/types";
import { getProvider } from "../providers/registry";
import { initOrderProviders } from "./init-providers";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { checkSubscriptionUpgrade } from "./check-subscription-upgrade";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";
import { ENABLE_DIRECT_CHARGE } from "../config";
import { getDefaultPaymentMethod } from "./get-default-payment-method";
import { chargeDirectly } from "./charge-directly";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { getNewUserUnlockOffer } from "@/server/offers/services/get-new-user-unlock-offer";
// import { UserOfferState } from "@prisma/client"; // 暂时不用
import { logger } from "@/server/shared/telemetry/logger";
import { confirmPaymentById } from "./confirm-payment";
import { resolvePaymentGateway } from "./resolve-gateway";
import { getProductPriceForCountry } from "@/server/product/services/get-price-for-currency";
import { resolveClientCountryCode } from "@/server/lib/resolve-client-country";

interface CheckoutParams {
  userId: string;
  productId: string;
  successUrl: string;
  cancelUrl: string;
  gateway?: "STRIPE" | "NOWPAYMENTS" | "LEMONSQUEEZY";
  cryptoCurrency?: string;
  quantity?: number;
  // 业务元信息（例如下载付费墙的 videoId/source），仅存入 payment.extra，在履约阶段使用
  metadata?: Record<string, unknown>;
  // Used for geo-based gateway routing (EU -> Airwallex, else -> Stripe)
  requestHeaders?: Headers;
  clientIp?: string;
}

export interface CheckoutResult {
  status: "OK";
  orderId: string;
  paymentId: string;
  // 如果需要跳转到 Stripe Checkout，返回 url
  url?: string;
  // 如果直接扣款成功，返回 success: true
  success?: boolean;
  // 如果需要 3DS 验证，返回 clientSecret
  requiresAction?: boolean;
  clientSecret?: string;
}

export interface CheckoutConflictResult {
  status: "CONFLICT";
  reason:
    | "ALREADY_SUBSCRIBED"
    | "OFFER_NOT_AVAILABLE"
    | "PAYMENT_METHOD_UNAVAILABLE";
  planType?: string;
  message: string;
}

function getCheckoutSessionId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const stripeObj = (extra as { stripe?: unknown }).stripe;
  if (!stripeObj || typeof stripeObj !== "object") return undefined;
  const cs = (stripeObj as { checkoutSessionId?: unknown }).checkoutSessionId;
  return typeof cs === "string" && cs.length > 0 ? cs : undefined;
}

async function proactivelyConfirmPendingStripeSubscriptionPayments(
  userId: string,
): Promise<void> {
  const now = new Date();
  const pending = await db.payment.findMany({
    where: {
      userId,
      paymentGateway: "STRIPE",
      status: "PENDING",
      isSubscription: true,
      deletedAt: null,
      expiresAt: { gt: now },
      order: { status: "PENDING" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const p of pending) {
    // Only attempt active confirmation when we have a checkoutSessionId or payment intent id.
    const hasCs = !!getCheckoutSessionId(p.extra);
    const hasPi =
      typeof p.gatewayTransactionId === "string" &&
      p.gatewayTransactionId.length > 0;
    if (!hasCs && !hasPi) continue;
    try {
      const res = await confirmPaymentById(p.id, userId);
      if (res.status === "SUCCEEDED") {
        logger.info(
          { userId, paymentId: p.id, orderId: res.orderId },
          "Checkout: proactively confirmed a pending subscription payment",
        );
      }
    } catch (error) {
      logger.warn(
        { userId, paymentId: p.id, error },
        "Checkout: proactive confirm failed (ignored)",
      );
    }
  }
}

async function expireOtherPendingStripeSubscriptionCheckouts(params: {
  userId: string;
  keepProductId: string;
}): Promise<void> {
  const now = new Date();
  const candidates = await db.payment.findMany({
    where: {
      userId: params.userId,
      paymentGateway: "STRIPE",
      status: "PENDING",
      isSubscription: true,
      deletedAt: null,
      expiresAt: { gt: now },
      order: {
        status: "PENDING",
        productId: { not: params.keepProductId },
      },
    },
    include: { order: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (candidates.length === 0) return;

  const provider = getProvider("STRIPE");

  for (const p of candidates) {
    // Safety valve: if this "pending" payment actually succeeded on Stripe (webhook delay),
    // confirm + fulfill it first; do NOT expire it.
    try {
      const confirmed = await confirmPaymentById(p.id, params.userId);
      if (confirmed.status === "SUCCEEDED") {
        logger.info(
          {
            userId: params.userId,
            paymentId: p.id,
            orderId: confirmed.orderId,
          },
          "Checkout: old pending subscription payment confirmed as SUCCEEDED; skip expiring",
        );
        continue;
      }
    } catch (error) {
      logger.warn(
        { userId: params.userId, paymentId: p.id, error },
        "Checkout: confirm old pending subscription payment failed (ignored)",
      );
    }

    const cs = getCheckoutSessionId(p.extra);
    if (cs) {
      try {
        await provider.expireCheckoutSession?.(cs);
      } catch (error) {
        // If already completed/expired, Stripe may reject; we still mark locally as expired to prevent reuse.
        logger.warn(
          {
            userId: params.userId,
            paymentId: p.id,
            checkoutSessionId: cs,
            error,
          },
          "Checkout: failed to expire Stripe session (ignored)",
        );
      }
    }

    await db.payment.update({
      where: { id: p.id },
      data: { status: "EXPIRED" },
    });

    // Best-effort: expire the order if it's still pending and still belongs to this payment's user
    // (avoid touching fulfilled/cancelled orders).
    if (p.order?.status === "PENDING") {
      await db.order.update({
        where: { id: p.order.id },
        data: { status: "EXPIRED" },
      });
    }
  }
}

export async function checkout({
  userId,
  productId,
  successUrl: _successUrl,
  cancelUrl: _cancelUrl,
  gateway: gatewayInput,
  cryptoCurrency,
  quantity,
  metadata,
  requestHeaders,
  clientIp,
}: CheckoutParams): Promise<CheckoutResult | CheckoutConflictResult> {
  // Ensure payment providers are registered before usage
  initOrderProviders();
  const product = await getProduct({
    productId,
    userId,
    fallbackHeaders: requestHeaders,
  });

  const purchaseQuantity =
    typeof quantity === "number" && quantity >= 1 ? quantity : 1;

  // Resolve payment gateway
  const gateway = await resolvePaymentGateway({
    userId,
    productId,
    gatewayInput,
    requestHeaders,
    clientIp,
  });

  // Subscription: proactive confirm pending Stripe payments to reduce webhook-delay window.
  if (product.type === "SUBSCRIPTION" && gateway === "STRIPE") {
    await proactivelyConfirmPendingStripeSubscriptionPayments(userId);
  }

  // =====================================================================
  // New User Offer (discounted SKU) - server-side enforcement
  // =====================================================================
  let offerEndsAtIso: string | undefined;
  if (product.id === NEW_USER_UNLOCK_OFFER.discountedProductId) {
    // If user already has an active subscription, treat this as a business conflict (no exception)
    const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({
      status: "NONE" as const,
    }));
    if (subStatus.status === "ACTIVE") {
      const planType = (subStatus as { planType?: string }).planType;
      const planLabel =
        planType === "STARTER"
          ? "Starter"
          : planType === "PLUS"
            ? "Pro"
            : planType === "PREMIUM"
              ? "Premium"
              : "your plan";
      return {
        status: "CONFLICT",
        reason: "ALREADY_SUBSCRIBED",
        planType,
        message: `You’re already subscribed (${planLabel}). No need to purchase again. If your benefits haven’t updated, please refresh.`,
      };
    }

    const offer = await getNewUserUnlockOffer({ userId }).catch(() => null);
    // 暂时移除 offer 过期检查，允许用户购买
    // if (!offer || offer.state !== UserOfferState.ACTIVE || !offer.endsAt || offer.endsAt.getTime() <= Date.now()) {
    //   return {
    //     status: "CONFLICT",
    //     reason: "OFFER_NOT_AVAILABLE",
    //     message: "This limited-time offer is no longer available. Please refresh pricing.",
    //   };
    // }

    offerEndsAtIso = offer?.endsAt?.toISOString();
  }

  // =====================================================================
  // 直接扣款路径：单次支付 + 启用直接扣款 + Stripe 网关 + 用户有保存的卡
  // =====================================================================
  if (
    ENABLE_DIRECT_CHARGE &&
    gateway === "STRIPE" &&
    product.type !== "SUBSCRIPTION" &&
    // Direct charge path currently only supports single-quantity purchases.
    // For quantity > 1, we must go through hosted checkout to ensure amount + fulfillment quantity are correct.
    purchaseQuantity === 1
  ) {
    const savedCard = await getDefaultPaymentMethod(userId);
    if (savedCard) {
      const result = await chargeDirectly({
        userId,
        product,
        paymentMethodId: savedCard.id,
      });

      if (result.success) {
        // Non-destructive preference sync: if the user hasn't explicitly chosen a gateway yet (AUTO),
        // and they successfully paid via Stripe, default them to STRIPE going forward.
        await db.user
          .updateMany({
            where: { id: userId, paymentGatewayPreference: "AUTO" },
            data: { paymentGatewayPreference: "TELEGRAM_STARS" },
          })
          .catch(() => undefined);

        return {
          status: "OK",
          orderId: result.orderId!,
          paymentId: result.paymentId!,
          success: true,
        };
      }

      if (result.requiresAction) {
        // 直扣款需要用户参与（如 3DS）。当前产品不走“前端接 clientSecret”完成验证的路径，
        // 而是统一回退到 Stripe Checkout（hosted）以保证用户能继续完成支付。
        logger.info(
          {
            userId,
            productId,
            orderId: result.orderId,
            paymentId: result.paymentId,
          },
          "Direct charge requires action; falling back to Stripe Checkout",
        );

        // Best-effort cleanup: avoid leaving a dangling pending order/payment created by the direct-charge attempt.
        // Only touch records that are still pending to avoid racing with other handlers.
        if (result.paymentId) {
          await db.payment
            .updateMany({
              where: { id: result.paymentId, userId, status: "PENDING" },
              data: { status: "FAILED" },
            })
            .catch(() => undefined);
        }
        if (result.orderId) {
          await db.order
            .updateMany({
              where: { id: result.orderId, userId, status: "PENDING" },
              data: { status: "CANCELLED" },
            })
            .catch(() => undefined);
        }
      }

      // 直接扣款失败，回退到 Checkout 流程
      // 继续执行下面的逻辑
    }
  }
  // =====================================================================

  // 如果是订阅类商品，检查是否为「从已有订阅升级」场景（支持 Stripe / Airwallex）
  const subscriptionUpgradeContext = await checkSubscriptionUpgrade({
    userId,
    product,
  });

  // Crypto plan switch: allow NOWPAYMENTS users to change plans by creating a new subscription
  // and cancelling the old one at fulfillment time (best-effort).
  // We intentionally avoid complex proration: user is paying a new invoice, and the old plan ends immediately.
  let cryptoSubscriptionUpgrade:
    | { fromSubscriptionId: string; fromPlanType?: string; toPlanType?: string }
    | undefined;

  // 后端决定订单类型：
  // - Subscription upgrade (Stripe / Airwallex): UPGRADE
  // - Crypto manual renew (NOWPAYMENTS): RENEWAL (allow paying next period early)
  // - Otherwise: NEW_PURCHASE
  let resolvedType: OrderType = subscriptionUpgradeContext
    ? "UPGRADE"
    : "NEW_PURCHASE";

  if (product.type === "SUBSCRIPTION" && !subscriptionUpgradeContext) {
    const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({
      status: "NONE" as const,
    }));

    if (
      subStatus.status === "ACTIVE" &&
      subStatus.subscriptionId &&
      subStatus.currentCycle
    ) {
      // Stripe: disallow duplicate purchase
      if (gateway !== "NOWPAYMENTS") {
        const planType = (subStatus as { planType?: string }).planType;
        const planLabel =
          planType === "STARTER"
            ? "Starter"
            : planType === "PLUS"
              ? "Pro"
              : planType === "PREMIUM"
                ? "Premium"
                : "your plan";
        return {
          status: "CONFLICT",
          reason: "ALREADY_SUBSCRIBED",
          planType,
          message: `You’re already subscribed (${planLabel}). No need to purchase again. If your benefits haven’t updated, please refresh.`,
        };
      }

      // NOWPAYMENTS:
      // - same plan: allow "renew early" (RENEWAL)
      // - different plan: allow plan switch (UPGRADE/DOWNGRADE) by creating a new subscription
      //   and cancelling the previous one during fulfillment.
      const productSub = product.productSubscription as
        | { planId?: string; plan?: { id?: string; type?: string } | null }
        | null
        | undefined;
      const targetPlanId =
        productSub?.planId ?? productSub?.plan?.id ?? undefined;
      const targetPlanType = productSub?.plan?.type ?? undefined;

      const userSub = await db.userSubscription.findUnique({
        where: { id: subStatus.subscriptionId },
        select: { id: true, planId: true, gateway: true },
      });

      const samePlan = !!targetPlanId && userSub?.planId === targetPlanId;
      const isCryptoSub =
        (userSub?.gateway ?? "").toUpperCase() === "NOWPAYMENTS";

      // If their current active subscription isn't crypto, don't allow switching to crypto here
      // (avoids accidental double billing; user should manage/cancel the Stripe subscription first).
      if (!isCryptoSub) {
        return {
          status: "CONFLICT",
          reason: "ALREADY_SUBSCRIBED",
          message:
            "You already have an active card subscription. Please manage/cancel it first before switching to crypto.",
        };
      }

      if (samePlan) {
        resolvedType = "RENEWAL";
      } else {
        // Plan switch via crypto: treat as upgrade/downgrade and cancel old subscription in fulfillment
        const fromPlanType = (subStatus as { planType?: string }).planType;
        const rank: Record<string, number> = {
          STARTER: 1,
          PLUS: 2,
          PREMIUM: 3,
        };
        const fromRank =
          typeof fromPlanType === "string" ? (rank[fromPlanType] ?? 0) : 0;
        const toRank =
          typeof targetPlanType === "string" ? (rank[targetPlanType] ?? 0) : 0;
        resolvedType =
          toRank > 0 && fromRank > 0 && toRank < fromRank
            ? "DOWNGRADE"
            : "UPGRADE";

        cryptoSubscriptionUpgrade = {
          fromSubscriptionId: userSub!.id,
          fromPlanType:
            typeof fromPlanType === "string" ? fromPlanType : undefined,
          toPlanType:
            typeof targetPlanType === "string" ? targetPlanType : undefined,
        };
      }
    }
  }

  // NOTE (Least surprise): Crypto checkout (NOWPAYMENTS) should charge exactly the product price.
  // Exception: USDT-TRC20 has a fixed TRON network fee ($9) to cover consolidation cost (business rule).
  // This is NOT a processing fee markup; it's a pass-through of actual blockchain cost.

  // Fixed TRON surcharge for USDT-TRC20 to cover consolidation cost (business rule)
  const tronSurchargeCents =
    gateway === "NOWPAYMENTS" &&
    (cryptoCurrency ?? "").toLowerCase() === "usdttrc20"
      ? 900
      : 0;
  const tronSurchargeLabel =
    tronSurchargeCents > 0 ? "TRON network fee" : undefined;

  // =====================================================================
  // Multi-currency pricing:
  // - Stripe: Uses localized EUR/GBP/CHF/AUD price based on user country
  // - NOWPAYMENTS (Crypto): Always USD, uses product.price
  // =====================================================================
  const productPricing = await (async () => {
    // Crypto always uses USD (product.price)
    if (gateway === "NOWPAYMENTS" || gateway === "LEMONSQUEEZY") {
      return {
        currency: "usd",
        amount: product.price,
        originalAmount: product.originalPrice,
        isLocalPrice: true,
      };
    }

    // Stripe: get price based on user's country (header > stored)
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { countryCode: true },
    });
    const resolved = resolveClientCountryCode({
      headers: requestHeaders ?? null,
      storedCountryCode: user?.countryCode ?? null,
    });
    const countryCode = resolved.countryCode ?? null;

    return getProductPriceForCountry(productId, countryCode);
  })();

  const effectiveCurrency = productPricing.currency.toLowerCase();
  const baseAmountCents = productPricing.amount * purchaseQuantity;

  if (effectiveCurrency !== "usd") {
    logger.info(
      {
        userId,
        productId,
        gateway,
        currency: effectiveCurrency,
        amount: productPricing.amount,
        isLocalPrice: productPricing.isLocalPrice,
      },
      "Checkout: using localized currency pricing",
    );
  }
  const finalAmountCents = baseAmountCents + tronSurchargeCents;

  // For Stripe gateway, ensure we have a Stripe Customer for this user
  let stripeCustomerId: string | undefined;
  if (gateway === "STRIPE") {
    stripeCustomerId = await getOrCreateStripeCustomer(userId);
  }

  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder({
      userId,
      productId,
      type: resolvedType,
      amount: finalAmountCents,
      quantity: purchaseQuantity,
      currency: effectiveCurrency,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "User already has an active subscription") {
      const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({
        status: "NONE" as const,
      }));
      const planType = (subStatus as { planType?: string }).planType;
      const planLabel =
        planType === "STARTER"
          ? "Starter"
          : planType === "PLUS"
            ? "Pro"
            : planType === "PREMIUM"
              ? "Premium"
              : "your plan";
      return {
        status: "CONFLICT",
        reason: "ALREADY_SUBSCRIBED",
        planType,
        message: `You’re already subscribed (${planLabel}). No need to purchase again. If your benefits haven’t updated, please refresh.`,
      };
    }
    throw err;
  }

  // Payment+URL idempotency: if this order already has a valid pending payment with a URL, return it directly.
  {
    const now = new Date();
    const requested =
      gateway === "NOWPAYMENTS" && cryptoCurrency ? cryptoCurrency : undefined;
    const existingPayment = await db.payment.findFirst({
      where: {
        orderId: order.id,
        userId,
        status: "PENDING",
        paymentGateway: gateway,
        deletedAt: null,
        expiresAt: { gt: now },
        paymentUrl: { not: null },
        ...(requested
          ? {
              // For crypto, do NOT reuse a pending invoice created for a different coin/network.
              extra: { path: ["requestedCryptoCurrency"], equals: requested },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingPayment?.paymentUrl) {
      logger.info(
        {
          userId,
          productId,
          orderId: order.id,
          paymentId: existingPayment.id,
          gateway,
        },
        "Checkout: returned existing pending payment url (idempotency)",
      );
      return {
        status: "OK",
        orderId: order.id,
        paymentId: existingPayment.id,
        url: existingPayment.paymentUrl,
      };
    }
  }

  // Subscription switch: expire other pending subscription checkouts (different product) to prevent later double-pay.
  if (product.type === "SUBSCRIPTION" && gateway === "STRIPE") {
    await expireOtherPendingStripeSubscriptionCheckouts({
      userId,
      keepProductId: productId,
    });
  }

  // If expiring/confirming other sessions resulted in an active subscription, block only NEW_PURCHASE.
  // This closes the webhook-delay race where a previous checkout was actually paid during this request.
  // For RENEWAL/UPGRADE/DOWNGRADE (incl. crypto plan switch), an active subscription is expected.
  if (product.type === "SUBSCRIPTION" && resolvedType === "NEW_PURCHASE") {
    const subStatusAfter = await getSubscriptionStatus({ userId }).catch(
      () => ({ status: "NONE" as const }),
    );
    if (subStatusAfter.status === "ACTIVE") {
      // Best-effort: avoid leaving a dangling pending order created for this attempt
      await db.order
        .update({ where: { id: order.id }, data: { status: "EXPIRED" } })
        .catch(() => null);
      const planType = (subStatusAfter as { planType?: string }).planType;
      const planLabel =
        planType === "STARTER"
          ? "Starter"
          : planType === "PLUS"
            ? "Pro"
            : planType === "PREMIUM"
              ? "Premium"
              : "your plan";
      return {
        status: "CONFLICT",
        reason: "ALREADY_SUBSCRIBED",
        planType,
        message: `You’re already subscribed (${planLabel}). No need to purchase again. If your benefits haven’t updated, please refresh.`,
      };
    }
  }

  const payment = await createPayment({
    orderId: order.id,
    userId,
    amount: finalAmountCents,
    currency: effectiveCurrency,
    isSubscription: product.type === "SUBSCRIPTION",
    paymentGateway: gateway,
    extra: cryptoCurrency
      ? { requestedCryptoCurrency: cryptoCurrency }
      : undefined,
  });

  const provider = getProvider(gateway);
  // Build success/cancel URLs with identifiers for better UX
  const successUrl = (() => {
    try {
      const u = new URL(_successUrl);
      u.searchParams.set("orderId", order.id);
      u.searchParams.set("paymentId", payment.id);
      return u.toString();
    } catch {
      return _successUrl; // fallback if not absolute, but client passes absolute
    }
  })();
  const cancelUrl = (() => {
    try {
      const u = new URL(_cancelUrl);
      u.searchParams.set("orderId", order.id);
      u.searchParams.set("paymentId", payment.id);
      return u.toString();
    } catch {
      return _cancelUrl;
    }
  })();

  // 合并业务 metadata（调用方传入的 metadata + 内部的订阅升级信息）
  const effectiveSubscriptionUpgrade =
    subscriptionUpgradeContext ?? cryptoSubscriptionUpgrade;
  const mergedMetadata =
    metadata || effectiveSubscriptionUpgrade || offerEndsAtIso
      ? {
          ...(metadata ?? {}),
          ...(effectiveSubscriptionUpgrade
            ? { subscriptionUpgrade: effectiveSubscriptionUpgrade }
            : {}),
          ...(offerEndsAtIso
            ? {
                offerEndsAt: offerEndsAtIso,
                offerType: NEW_USER_UNLOCK_OFFER.type,
              }
            : {}),
          ...(purchaseQuantity > 1 ? { quantity: purchaseQuantity } : {}),
        }
      : purchaseQuantity > 1
        ? { quantity: purchaseQuantity }
        : undefined;

  const finalMetadata =
    gateway === "NOWPAYMENTS" && tronSurchargeCents > 0
      ? {
          ...(mergedMetadata ?? {}),
          tronSurcharge: {
            cents: tronSurchargeCents,
            label: tronSurchargeLabel,
          },
        }
      : mergedMetadata;

  const providerPayment = {
    id: payment.id,
    // Merge persisted extras with runtime Success/Cancel URLs for the provider
    extra: {
      ...((payment.extra ?? {}) as Record<string, unknown>),
      SuccessURL: successUrl,
      CancelURL: cancelUrl,
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      ...(finalMetadata ? { metadata: finalMetadata } : {}),
    },
  };
  const providerOrder = {
    id: order.id,
    amount: finalAmountCents,
    currency: order.currency,
    productSnapshot: order.productSnapshot as ProductSnapshot | null,
  };
  const session = await (async () => {
    try {
      return product.type === "SUBSCRIPTION"
        ? await provider.createSubscription({
            payment: providerPayment,
            order: providerOrder,
          })
        : await provider.createPayment({
            payment: providerPayment,
            order: providerOrder,
          });
    } catch (err) {
      // Expected / non-exceptional business failures for crypto
      const maybe = err as {
        name?: unknown;
        code?: unknown;
        payload?: unknown;
        message?: unknown;
      };
      const code = typeof maybe?.code === "string" ? maybe.code : "";
      const message =
        typeof maybe?.message === "string"
          ? maybe.message
          : "Failed to create checkout session";

      // NowPayments minimal amount error (common on BTC/ETH for low-ticket orders)
      if (
        gateway === "NOWPAYMENTS" &&
        (code === "AMOUNT_MINIMAL_ERROR" ||
          message.includes("AMOUNT_MINIMAL_ERROR"))
      ) {
        // Mark order/payment as not usable so user can retry with another coin
        await db.payment
          .update({ where: { id: payment.id }, data: { status: "FAILED" } })
          .catch(() => null);
        await db.order
          .update({ where: { id: order.id }, data: { status: "EXPIRED" } })
          .catch(() => null);
        return null;
      }

      // Other provider errors should remain exceptional
      throw err;
    }
  })();

  if (session === null) {
    return {
      status: "CONFLICT",
      reason: "PAYMENT_METHOD_UNAVAILABLE",
      message:
        "This coin/network requires a higher minimum amount for this order. Please choose USDT/USDC (recommended) or increase the order amount.",
    };
  }

  // 持久化 Checkout Session ID 和 URL 到 payment.extra，方便补偿逻辑使用
  // 注意：provider 可能会往 payment.extra 写入 provider-specific 字段（例如 NowPayments 的 pay_address），
  // 因此这里优先使用 providerPayment.extra（它是传入 provider 的那份对象）。
  const baseExtra = (providerPayment.extra ?? {}) as Record<string, unknown>;
  const stripeExtra =
    typeof baseExtra.stripe === "object" && baseExtra.stripe !== null
      ? (baseExtra.stripe as Record<string, unknown>)
      : {};
  const lemonSqueezyExtra =
    typeof baseExtra.lemonsqueezy === "object" &&
    baseExtra.lemonsqueezy !== null
      ? (baseExtra.lemonsqueezy as Record<string, unknown>)
      : {};

  const nextExtra: Record<string, unknown> = { ...baseExtra };

  if (stripeCustomerId) {
    nextExtra.stripeCustomerId = stripeCustomerId;
  }

  if (finalMetadata) {
    nextExtra.metadata = finalMetadata;
  }

  if (session.checkoutSessionId) {
    if (gateway === "STRIPE") {
      nextExtra.stripe = {
        ...stripeExtra,
        checkoutSessionId: session.checkoutSessionId,
      };
    } else if (gateway === "LEMONSQUEEZY") {
      nextExtra.lemonsqueezy = {
        ...lemonSqueezyExtra,
        ...(session.providerExtra ?? {}),
        checkoutId: session.checkoutSessionId,
      };
    }
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      extra: nextExtra as Prisma.JsonObject,
      paymentUrl: session.paymentUrl,
      gatewayTransactionId:
        "gatewayTransactionId" in session
          ? (session.gatewayTransactionId ?? undefined)
          : undefined,
      gatewaySubscriptionId:
        "gatewaySubscriptionId" in session
          ? (session.gatewaySubscriptionId ?? undefined)
          : undefined,
    },
  });

  // Keep order.amount in sync with payable amount for reporting/notifications.
  if (finalAmountCents !== order.amount) {
    await db.order.update({
      where: { id: order.id },
      data: { amount: finalAmountCents },
    });
  }

  return {
    status: "OK",
    orderId: order.id,
    paymentId: payment.id,
    url: session.paymentUrl,
  };
}
