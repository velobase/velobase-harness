import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/shared/env";
import { redis } from "@/server/redis";
import { logger } from "@/server/shared/telemetry/logger";
import { createNowPaymentsPayment, getNowPaymentsMinAmount } from "../providers/nowpayments";
import { APP_NAME } from "@/config/brand";

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getCallbackBase(extra: unknown): string {
  const obj = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
  const u =
    typeof obj.SuccessURL === "string" && obj.SuccessURL.length > 0
      ? obj.SuccessURL
      : env.APP_URL ?? "";
  try {
    return new URL(u).origin;
  } catch {
    return env.APP_URL ?? "";
  }
}

function getRequestedCryptoCurrency(extra: unknown): string | undefined {
  const obj = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
  const v = obj.requestedCryptoCurrency;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function getNowPaymentsExtra(extra: unknown): Record<string, unknown> | null {
  if (!extra || typeof extra !== "object") return null;
  const np = (extra as { nowpayments?: unknown }).nowpayments;
  if (!np || typeof np !== "object") return null;
  return np as Record<string, unknown>;
}

export type CreateCryptoInvoiceResult =
  | { status: "SUCCESS"; paymentId: string; gatewayTransactionId: string; nowpayments: Record<string, unknown> }
  | { status: "RATE_LIMITED"; retryAfterSeconds: number }
  | { status: "ALREADY_TERMINAL"; paymentId: string; paymentStatus: string }
  | {
      status: "AMOUNT_TOO_LOW";
      message: string;
      priceAmount: number;
      priceCurrency: string;
      payCurrency: string;
      minAmountUsd?: number;
      minAmountCrypto?: number;
    };

function isNowPaymentsMinimalAmountError(err: unknown) {
  const e = err as { message?: unknown; code?: unknown; name?: unknown } | null | undefined;
  const msg = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "string" ? e.code : "";
  const name = typeof e?.name === "string" ? e.name : "";
  if (code === "AMOUNT_MINIMAL_ERROR") return true;
  if (msg.includes("AMOUNT_MINIMAL_ERROR")) return true;
  // Common message from NowPayments: "Crypto amount X is less than minimal"
  if (msg.toLowerCase().includes("less than minimal")) return true;
  // Some gateways surface it as "minimal amount"
  if (msg.toLowerCase().includes("minimal") && msg.toLowerCase().includes("amount")) return true;
  // If it's our typed error and has the code set
  if (name === "NowPaymentsApiError" && code === "AMOUNT_MINIMAL_ERROR") return true;
  return false;
}

export async function createCryptoInvoice(params: { userId: string; paymentId: string }): Promise<CreateCryptoInvoiceResult> {
  const payment = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { order: true },
  });

  if (!payment) throw new Error("Payment not found");
  if (payment.userId !== params.userId) throw new Error("Unauthorized");

  const gateway = (payment.paymentGateway ?? "").toUpperCase();
  if (gateway !== "NOWPAYMENTS") throw new Error("Payment gateway is not NOWPAYMENTS");

  // If payment is no longer pending (e.g. webhook already marked it SUCCEEDED/EXPIRED),
  // return gracefully instead of throwing — this is a normal race condition.
  if (payment.status !== "PENDING") {
    return { status: "ALREADY_TERMINAL", paymentId: payment.id, paymentStatus: payment.status };
  }

  const now = Date.now();
  if (payment.expiresAt && payment.expiresAt.getTime() <= now) {
    return { status: "ALREADY_TERMINAL", paymentId: payment.id, paymentStatus: "EXPIRED" };
  }

  // Idempotency: if already created, return existing provider data
  const existingNp = getNowPaymentsExtra(payment.extra);
  const existingNpPaymentId = existingNp?.payment_id;
  if (typeof existingNpPaymentId === "string" && existingNpPaymentId.length > 0) {
    return {
      status: "SUCCESS",
      paymentId: payment.id,
      gatewayTransactionId: existingNpPaymentId,
      nowpayments: existingNp!,
    };
  }

  // Best-effort per-payment lock (prevents multi-tab / multi-pod duplicate invoice creation)
  const lockKey = `nowpayments:invoice:lock:${payment.id}`;
  const lockTtlMs = 30_000;
  const lockRes = await redis.set(lockKey, "1", "PX", lockTtlMs, "NX").catch(() => null);
  if (lockRes !== "OK") {
    // Another request is creating the invoice right now; tell client to wait
    return { status: "RATE_LIMITED" as const, retryAfterSeconds: 5 };
  }

  try {
    if (!payment.order) throw new Error("Order not found for payment");

    // Convert cents -> dollars (keep 2 decimals, avoid float drift)
    const priceAmount = Number(((payment.order.amount ?? payment.amount) / 100).toFixed(2));
    const priceCurrency = (payment.order.currency ?? payment.currency ?? "usd").toLowerCase();

    const requested = getRequestedCryptoCurrency(payment.extra);
    const payCurrency = (requested ?? env.NOWPAYMENTS_PAY_CURRENCY ?? "usdttrc20").toLowerCase();

    // Best-effort guard: avoid calling NowPayments if we already know it's below minimal.
    // (This happens frequently for low-ticket products like $4.99 when min-amount lookup is flaky.)
    try {
      const min = await getNowPaymentsMinAmount(payCurrency);
      const minUsdRaw = typeof min.fiat_equivalent === "number" ? min.fiat_equivalent : 0;
      const safeMinUsd = minUsdRaw > 0 ? minUsdRaw * 1.05 : 0;
      if (safeMinUsd > 0 && priceAmount < safeMinUsd) {
        const msg = `This coin/network requires a minimum transaction of $${safeMinUsd.toFixed(
          2
        )}. Please increase quantity or choose another network (USDT/USDC recommended).`;
        // Mark as not usable so user can retry with another coin/quantity.
        await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }).catch(() => null);
        await db.order.update({ where: { id: payment.order.id }, data: { status: "EXPIRED" } }).catch(() => null);
        return {
          status: "AMOUNT_TOO_LOW" as const,
          message: msg,
          priceAmount,
          priceCurrency,
          payCurrency,
          minAmountUsd: safeMinUsd,
          minAmountCrypto: typeof min.min_amount === "number" ? min.min_amount : undefined,
        };
      }
    } catch {
      // ignore; fall through to provider call and handle provider error below
    }

    const callbackBase = getCallbackBase(payment.extra);
    const ipnCallbackUrl = `${callbackBase}/api/webhooks/nowpayments`;

    const orderDescription = (() => {
      const snap = payment.order.productSnapshot as unknown;
      const name =
        snap && typeof snap === "object"
          ? (() => {
              const n = (snap as Record<string, unknown>).name;
              return typeof n === "string" ? n : null;
            })()
          : null;
      return name ? `${APP_NAME} - ${name} - ${payment.order.id}` : `${APP_NAME} Order ${payment.order.id}`;
    })();

    const created = await createNowPaymentsPayment({
      priceAmount,
      priceCurrency,
      payCurrency,
      // Use our Payment ID as order_id so webhook can map back without extra lookups.
      orderId: payment.id,
      orderDescription,
      ipnCallbackUrl,
    });

    const npPaymentId = String(created.payment_id);

    const mergedExtra: Record<string, unknown> = {
      ...(payment.extra && typeof payment.extra === "object" ? (payment.extra as Record<string, unknown>) : {}),
      nowpayments: {
        ...(existingNp ?? {}),
        payment_id: npPaymentId,
        pay_address: created.pay_address ?? existingNp?.pay_address,
        pay_amount: toNumber(created.pay_amount) ?? existingNp?.pay_amount,
        pay_currency: created.pay_currency ?? payCurrency,
        price_amount: toNumber(created.price_amount) ?? priceAmount,
        price_currency: created.price_currency ?? priceCurrency,
      },
    };

    await db.payment.update({
      where: { id: payment.id },
      data: {
        extra: mergedExtra as Prisma.JsonObject,
        gatewayTransactionId: npPaymentId,
      },
    });

    logger.info(
      { paymentId: payment.id, orderId: payment.orderId, npPaymentId, payCurrency },
      "NowPayments invoice created (lazy)"
    );

    return {
      status: "SUCCESS" as const,
      paymentId: payment.id,
      gatewayTransactionId: npPaymentId,
      nowpayments: mergedExtra.nowpayments as Record<string, unknown>,
    };
  } catch (err) {
    // If NowPayments returned 429, return structured RATE_LIMITED instead of throwing.
    // Let NowPayments enforce its own rate limit — no global cooldown needed.
    const maybe = err as { statusCode?: number; retryAfterSeconds?: number } | undefined;
    if (maybe?.statusCode === 429) {
      const s = typeof maybe.retryAfterSeconds === "number" && maybe.retryAfterSeconds > 0 ? maybe.retryAfterSeconds : 2;
      return { status: "RATE_LIMITED" as const, retryAfterSeconds: s };
    }

    // NowPayments minimal amount error — convert to a structured response to avoid bubbling as TRPCError.
    if (isNowPaymentsMinimalAmountError(err)) {
      // Best-effort enrich with min-amount info for UX; do not block on failures.
      const requested = getRequestedCryptoCurrency(payment.extra);
      const payCurrency = (requested ?? env.NOWPAYMENTS_PAY_CURRENCY ?? "usdttrc20").toLowerCase();
      const priceAmount = Number(((payment.order?.amount ?? payment.amount) / 100).toFixed(2));
      const priceCurrency = (payment.order?.currency ?? payment.currency ?? "usd").toLowerCase();
      let minAmountUsd: number | undefined;
      let minAmountCrypto: number | undefined;
      try {
        const min = await getNowPaymentsMinAmount(payCurrency);
        const minUsdRaw = typeof min.fiat_equivalent === "number" ? min.fiat_equivalent : 0;
        minAmountUsd = minUsdRaw > 0 ? minUsdRaw * 1.05 : undefined;
        minAmountCrypto = typeof min.min_amount === "number" ? min.min_amount : undefined;
      } catch {
        // ignore
      }
      const safeMinText =
        typeof minAmountUsd === "number" && Number.isFinite(minAmountUsd)
          ? `$${minAmountUsd.toFixed(2)}`
          : "the network minimum";
      const msg = `This coin/network requires a minimum transaction of ${safeMinText}. Please increase quantity or choose another network (USDT/USDC recommended).`;

      await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }).catch(() => null);
      if (payment.order?.id) {
        await db.order.update({ where: { id: payment.order.id }, data: { status: "EXPIRED" } }).catch(() => null);
      }

      return {
        status: "AMOUNT_TOO_LOW" as const,
        message: msg,
        priceAmount,
        priceCurrency,
        payCurrency,
        minAmountUsd,
        minAmountCrypto,
      };
    }

    throw err;
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
}
