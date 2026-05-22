import { createOrder } from "./create-order";
import { createPayment } from "./create-payment";
import { getProduct } from "@/server/product/services/get";
import type { OrderType } from "../types";
import { getAdapter } from "../providers/registry";
import { initOrderProviders } from "./init-providers";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { checkSubscriptionUpgrade } from "./check-subscription-upgrade";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";
import { ENABLE_DIRECT_CHARGE } from "../config";
import { getDefaultPaymentMethod } from "./get-default-payment-method";
import { chargeDirectly } from "./charge-directly";
import { NEW_USER_UNLOCK_OFFER } from "@/server/offers/constants";
import { getNewUserUnlockOffer } from "@/server/offers/services/get-new-user-unlock-offer";
import { logger } from "@/server/shared/telemetry/logger";
import { confirmPaymentById } from "./confirm-payment";
import { resolvePaymentGateway } from "./resolve-gateway";
import { getProductPriceForCountry } from "@/server/product/services/get-price-for-currency";
import { resolveClientCountryCode } from "@/server/lib/resolve-client-country";
import type { PaymentGateway, CheckoutRequest } from "../providers/types";

interface CheckoutParams {
  userId: string;
  productId: string;
  successUrl: string;
  cancelUrl: string;
  gateway?: PaymentGateway;
  cryptoCurrency?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
  requestHeaders?: Headers;
  clientIp?: string;
}

export interface CheckoutResult {
  status: "OK";
  orderId: string;
  paymentId: string;
  url?: string;
  success?: boolean;
  requiresAction?: boolean;
  clientSecret?: string;
}

export interface CheckoutConflictResult {
  status: "CONFLICT";
  reason: "ALREADY_SUBSCRIBED" | "OFFER_NOT_AVAILABLE" | "PAYMENT_METHOD_UNAVAILABLE";
  planType?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Proactive confirm + expire helpers (gateway-neutral via adapter)
// ---------------------------------------------------------------------------

function getCheckoutId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const e = extra as Record<string, unknown>;
  if (typeof e.gatewayCheckoutId === "string" && e.gatewayCheckoutId.length > 0) return e.gatewayCheckoutId;
  const stripe = e.stripe as Record<string, unknown> | undefined;
  if (stripe && typeof stripe.checkoutSessionId === "string" && stripe.checkoutSessionId.length > 0) return stripe.checkoutSessionId;
  return undefined;
}

async function proactivelyConfirmPendingPayments(userId: string, gateway: PaymentGateway): Promise<void> {
  const now = new Date();
  const pending = await db.payment.findMany({
    where: {
      userId,
      paymentGateway: gateway,
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
    const hasCs = !!getCheckoutId(p.extra);
    const hasPi = typeof p.gatewayTransactionId === "string" && p.gatewayTransactionId.length > 0;
    if (!hasCs && !hasPi) continue;
    try {
      const res = await confirmPaymentById(p.id, userId);
      if (res.status === "SUCCEEDED") {
        logger.info({ userId, paymentId: p.id, orderId: res.orderId }, "Checkout: proactively confirmed pending payment");
      }
    } catch (error) {
      logger.warn({ userId, paymentId: p.id, error }, "Checkout: proactive confirm failed (ignored)");
    }
  }
}

async function expireOtherPendingCheckouts(params: {
  userId: string;
  keepProductId: string;
  gateway: PaymentGateway;
}): Promise<void> {
  const now = new Date();
  const candidates = await db.payment.findMany({
    where: {
      userId: params.userId,
      paymentGateway: params.gateway,
      status: "PENDING",
      isSubscription: true,
      deletedAt: null,
      expiresAt: { gt: now },
      order: { status: "PENDING", productId: { not: params.keepProductId } },
    },
    include: { order: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (candidates.length === 0) return;

  let adapter;
  try { adapter = getAdapter(params.gateway); } catch { return; }

  for (const p of candidates) {
    // Safety: confirm if actually paid
    try {
      const confirmed = await confirmPaymentById(p.id, params.userId);
      if (confirmed.status === "SUCCEEDED") continue;
    } catch { /* ignored */ }

    // Expire via adapter
    const cs = getCheckoutId(p.extra);
    if (cs && adapter.expireCheckout) {
      try { await adapter.expireCheckout(cs); } catch { /* ignored */ }
    }

    await db.payment.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
    if (p.order?.status === "PENDING") {
      await db.order.update({ where: { id: p.order.id }, data: { status: "EXPIRED" } });
    }
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

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
  initOrderProviders();
  const product = await getProduct({ productId, userId, fallbackHeaders: requestHeaders });
  const purchaseQuantity = typeof quantity === "number" && quantity >= 1 ? quantity : 1;

  const gateway = await resolvePaymentGateway({ userId, productId, gatewayInput, requestHeaders, clientIp });

  // Proactive confirm pending subscription payments
  if (product.type === "SUBSCRIPTION") {
    await proactivelyConfirmPendingPayments(userId, gateway);
  }

  // ── New User Offer validation ──
  let offerEndsAtIso: string | undefined;
  if (product.id === NEW_USER_UNLOCK_OFFER.discountedProductId) {
    const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({ status: "NONE" as const }));
    if (subStatus.status === "ACTIVE") {
      const planType = (subStatus as { planType?: string }).planType;
      const planLabel = planType === "STARTER" ? "Starter" : planType === "PLUS" ? "Pro" : planType === "PREMIUM" ? "Premium" : "your plan";
      return { status: "CONFLICT", reason: "ALREADY_SUBSCRIBED", planType, message: `You're already subscribed (${planLabel}). No need to purchase again. If your benefits haven't updated, please refresh.` };
    }
    const offer = await getNewUserUnlockOffer({ userId }).catch(() => null);
    offerEndsAtIso = offer?.endsAt?.toISOString();
  }

  // ── Direct charge path (Stripe only, adapter-internal optimization) ──
  if (ENABLE_DIRECT_CHARGE && gateway === "STRIPE" && product.type !== "SUBSCRIPTION" && purchaseQuantity === 1) {
    const savedCard = await getDefaultPaymentMethod(userId);
    if (savedCard) {
      const result = await chargeDirectly({ userId, product, paymentMethodId: savedCard.id });
      if (result.success) {
        await db.user.updateMany({
          where: { id: userId, paymentGatewayPreference: "AUTO" },
          data: { paymentGatewayPreference: "TELEGRAM_STARS" },
        }).catch(() => undefined);
        return { status: "OK", orderId: result.orderId!, paymentId: result.paymentId!, success: true };
      }
      if (result.requiresAction) {
        logger.info({ userId, productId }, "Direct charge requires action; falling back to checkout");
        if (result.paymentId) await db.payment.updateMany({ where: { id: result.paymentId, userId, status: "PENDING" }, data: { status: "FAILED" } }).catch(() => undefined);
        if (result.orderId) await db.order.updateMany({ where: { id: result.orderId, userId, status: "PENDING" }, data: { status: "CANCELLED" } }).catch(() => undefined);
      }
    }
  }

  // ── Subscription upgrade check ──
  const subscriptionUpgradeContext = await checkSubscriptionUpgrade({ userId, product });

  let cryptoSubscriptionUpgrade: { fromSubscriptionId: string; fromPlanType?: string; toPlanType?: string } | undefined;
  let resolvedType: OrderType = subscriptionUpgradeContext ? "UPGRADE" : "NEW_PURCHASE";

  if (product.type === "SUBSCRIPTION" && !subscriptionUpgradeContext) {
    const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({ status: "NONE" as const }));
    if (subStatus.status === "ACTIVE" && subStatus.subscriptionId && subStatus.currentCycle) {
      if (gateway !== "NOWPAYMENTS") {
        const planType = (subStatus as { planType?: string }).planType;
        const planLabel = planType === "STARTER" ? "Starter" : planType === "PLUS" ? "Pro" : planType === "PREMIUM" ? "Premium" : "your plan";
        return { status: "CONFLICT", reason: "ALREADY_SUBSCRIBED", planType, message: `You're already subscribed (${planLabel}). No need to purchase again. If your benefits haven't updated, please refresh.` };
      }

      const productSub = product.productSubscription as { planId?: string; plan?: { id?: string; type?: string } | null } | null | undefined;
      const targetPlanId = productSub?.planId ?? productSub?.plan?.id;
      const targetPlanType = productSub?.plan?.type;

      const userSub = await db.userSubscription.findUnique({
        where: { id: subStatus.subscriptionId },
        select: { id: true, planId: true, gateway: true },
      });

      const samePlan = !!targetPlanId && userSub?.planId === targetPlanId;
      const isCryptoSub = (userSub?.gateway ?? "").toUpperCase() === "NOWPAYMENTS";

      if (!isCryptoSub) {
        return { status: "CONFLICT", reason: "ALREADY_SUBSCRIBED", message: "You already have an active card subscription. Please manage/cancel it first before switching to crypto." };
      }

      if (samePlan) {
        resolvedType = "RENEWAL";
      } else {
        const fromPlanType = (subStatus as { planType?: string }).planType;
        const rank: Record<string, number> = { STARTER: 1, PLUS: 2, PREMIUM: 3 };
        const fromRank = typeof fromPlanType === "string" ? (rank[fromPlanType] ?? 0) : 0;
        const toRank = typeof targetPlanType === "string" ? (rank[targetPlanType] ?? 0) : 0;
        resolvedType = toRank > 0 && fromRank > 0 && toRank < fromRank ? "DOWNGRADE" : "UPGRADE";
        cryptoSubscriptionUpgrade = { fromSubscriptionId: userSub!.id, fromPlanType: typeof fromPlanType === "string" ? fromPlanType : undefined, toPlanType: typeof targetPlanType === "string" ? targetPlanType : undefined };
      }
    }
  }

  // ── Pricing ──
  const tronSurchargeCents = gateway === "NOWPAYMENTS" && (cryptoCurrency ?? "").toLowerCase() === "usdttrc20" ? 900 : 0;

  const productPricing = await (async () => {
    if (gateway === "NOWPAYMENTS") return { currency: "usd", amount: product.price, originalAmount: product.originalPrice, isLocalPrice: true };
    const user = await db.user.findUnique({ where: { id: userId }, select: { countryCode: true } });
    const resolved = resolveClientCountryCode({ headers: requestHeaders ?? null, storedCountryCode: user?.countryCode ?? null });
    return getProductPriceForCountry(productId, resolved.countryCode ?? null);
  })();

  const effectiveCurrency = productPricing.currency.toLowerCase();
  const baseAmountCents = productPricing.amount * purchaseQuantity;
  const finalAmountCents = baseAmountCents + tronSurchargeCents;

  // ── Adapter: ensure customer ──
  const adapter = getAdapter(gateway);
  if (adapter.ensureCustomer) {
    await adapter.ensureCustomer(userId);
  }

  // ── Create order ──
  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder({ userId, productId, type: resolvedType, amount: finalAmountCents, quantity: purchaseQuantity, currency: effectiveCurrency });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "User already has an active subscription") {
      const subStatus = await getSubscriptionStatus({ userId }).catch(() => ({ status: "NONE" as const }));
      const planType = (subStatus as { planType?: string }).planType;
      const planLabel = planType === "STARTER" ? "Starter" : planType === "PLUS" ? "Pro" : planType === "PREMIUM" ? "Premium" : "your plan";
      return { status: "CONFLICT", reason: "ALREADY_SUBSCRIBED", planType, message: `You're already subscribed (${planLabel}). No need to purchase again. If your benefits haven't updated, please refresh.` };
    }
    throw err;
  }

  // ── Payment idempotency: reuse existing pending ──
  {
    const now = new Date();
    const requested = gateway === "NOWPAYMENTS" && cryptoCurrency ? cryptoCurrency : undefined;
    const existingPayment = await db.payment.findFirst({
      where: {
        orderId: order.id, userId, status: "PENDING", paymentGateway: gateway, deletedAt: null,
        expiresAt: { gt: now }, paymentUrl: { not: null },
        ...(requested ? { extra: { path: ["requestedCryptoCurrency"], equals: requested } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingPayment?.paymentUrl) {
      return { status: "OK", orderId: order.id, paymentId: existingPayment.id, url: existingPayment.paymentUrl };
    }
  }

  // ── Expire other pending subscription checkouts ──
  if (product.type === "SUBSCRIPTION") {
    await expireOtherPendingCheckouts({ userId, keepProductId: productId, gateway });
  }

  // ── Race condition guard ──
  if (product.type === "SUBSCRIPTION" && resolvedType === "NEW_PURCHASE") {
    const subStatusAfter = await getSubscriptionStatus({ userId }).catch(() => ({ status: "NONE" as const }));
    if (subStatusAfter.status === "ACTIVE") {
      await db.order.update({ where: { id: order.id }, data: { status: "EXPIRED" } }).catch(() => null);
      const planType = (subStatusAfter as { planType?: string }).planType;
      const planLabel = planType === "STARTER" ? "Starter" : planType === "PLUS" ? "Pro" : planType === "PREMIUM" ? "Premium" : "your plan";
      return { status: "CONFLICT", reason: "ALREADY_SUBSCRIBED", planType, message: `You're already subscribed (${planLabel}). No need to purchase again. If your benefits haven't updated, please refresh.` };
    }
  }

  // ── Create payment record ──
  const payment = await createPayment({
    orderId: order.id, userId, amount: finalAmountCents, currency: effectiveCurrency,
    isSubscription: product.type === "SUBSCRIPTION", paymentGateway: gateway,
    extra: cryptoCurrency ? { requestedCryptoCurrency: cryptoCurrency } : undefined,
  });

  // ── Build URLs ──
  const successUrl = (() => { try { const u = new URL(_successUrl); u.searchParams.set("orderId", order.id); u.searchParams.set("paymentId", payment.id); return u.toString(); } catch { return _successUrl; } })();
  const cancelUrl = (() => { try { const u = new URL(_cancelUrl); u.searchParams.set("orderId", order.id); u.searchParams.set("paymentId", payment.id); return u.toString(); } catch { return _cancelUrl; } })();

  // ── Merge metadata ──
  const effectiveSubscriptionUpgrade = subscriptionUpgradeContext ?? cryptoSubscriptionUpgrade;
  const mergedMetadata: Record<string, string> = {};
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") mergedMetadata[k] = String(v);
    }
  }
  if (effectiveSubscriptionUpgrade) mergedMetadata.subscriptionUpgrade = JSON.stringify(effectiveSubscriptionUpgrade);
  if (offerEndsAtIso) { mergedMetadata.offerEndsAt = offerEndsAtIso; mergedMetadata.offerType = NEW_USER_UNLOCK_OFFER.type; }
  if (purchaseQuantity > 1) mergedMetadata.quantity = String(purchaseQuantity);
  mergedMetadata.cancelUrl = cancelUrl;

  // ── Call adapter ──
  const checkoutRequest: CheckoutRequest = {
    mode: product.type === "SUBSCRIPTION" ? "subscription" : "payment",
    orderId: order.id,
    paymentId: payment.id,
    userId,
    amount: finalAmountCents,
    currency: effectiveCurrency,
    productName: (order.productSnapshot as { name?: string } | null)?.name ?? "Product",
    successUrl,
    cancelUrl,
    metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
    interval: (order.productSnapshot as { interval?: "week" | "month" | "year" } | null)?.interval,
    productMetadata: product.metadata as Record<string, unknown> | undefined,
    trialDays: product.hasTrial && typeof product.trialDays === "number" && product.trialDays > 0 ? product.trialDays : undefined,
  };

  let session: Awaited<ReturnType<typeof adapter.createCheckout>>;
  try {
    session = await adapter.createCheckout(checkoutRequest);
  } catch (err) {
    const maybe = err as { code?: string; message?: string };
    if (gateway === "NOWPAYMENTS" && (maybe.code === "AMOUNT_MINIMAL_ERROR" || (maybe.message ?? "").includes("AMOUNT_MINIMAL_ERROR"))) {
      await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }).catch(() => null);
      await db.order.update({ where: { id: order.id }, data: { status: "EXPIRED" } }).catch(() => null);
      return { status: "CONFLICT", reason: "PAYMENT_METHOD_UNAVAILABLE", message: "This coin/network requires a higher minimum amount. Please choose USDT/USDC (recommended) or increase the order amount." };
    }
    throw err;
  }

  // ── Persist checkout result ──
  const extraToSave: Record<string, unknown> = {
    ...((payment.extra ?? {}) as Record<string, unknown>),
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
  };
  if (session.checkoutId) extraToSave.gatewayCheckoutId = session.checkoutId;
  if (session.extra) extraToSave[gateway.toLowerCase()] = session.extra;

  await db.payment.update({
    where: { id: payment.id },
    data: {
      extra: extraToSave as Prisma.JsonObject,
      paymentUrl: session.url,
      gatewayTransactionId: session.transactionId ?? undefined,
      gatewaySubscriptionId: session.subscriptionId ?? undefined,
    },
  });

  if (finalAmountCents !== order.amount) {
    await db.order.update({ where: { id: order.id }, data: { amount: finalAmountCents } });
  }

  return { status: "OK", orderId: order.id, paymentId: payment.id, url: session.url };
}
