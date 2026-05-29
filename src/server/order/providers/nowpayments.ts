import crypto from "crypto";
import { z } from "zod";
import { BaseWebhookResult, type PaymentProvider, type ProviderOrder, type ProviderPayment } from "./types";
import { env } from "@/server/shared/env";

const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io";

function requireNowPaymentsApiKey(): string {
  const apiKey = env.NOWPAYMENTS_API_KEY;
  if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY is required");
  return apiKey;
}

// NOTE:
// NowPayments IPN fields are not stable in type across gateways/versions:
// e.g. `updated_at` can be a number (ms epoch) or string; amounts can be stringified numbers;
// some fields can be null. Be tolerant and keep unknown fields for analytics/debugging.
const stringOrNumber = z.union([z.number(), z.string()]);
const nowpaymentsIpnSchema = z
  .object({
    payment_id: stringOrNumber,
    payment_status: z.string(),
    order_id: z.string().optional().nullable(),
    price_amount: stringOrNumber.optional().nullable(),
    price_currency: z.string().optional().nullable(),
    pay_amount: stringOrNumber.optional().nullable(),
    pay_currency: z.string().optional().nullable(),
    actually_paid: stringOrNumber.optional().nullable(),
    actually_paid_at_fiat: stringOrNumber.optional().nullable(),
    updated_at: stringOrNumber.optional().nullable(),
  })
  .passthrough();

type Json = Record<string, unknown>;

export class NowPaymentsApiError extends Error {
  statusCode?: number;
  code?: string;
  payload?: Json;
  retryAfterSeconds?: number;
  constructor(message: string, opts?: { statusCode?: number; code?: string; payload?: Json; retryAfterSeconds?: number }) {
    super(message);
    this.name = "NowPaymentsApiError";
    this.statusCode = opts?.statusCode;
    this.code = opts?.code;
    this.payload = opts?.payload;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const asInt = Number.parseInt(headerValue, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  // Retry-After can be an HTTP date
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    const deltaMs = asDate - Date.now();
    if (deltaMs <= 0) return 0;
    return Math.ceil(deltaMs / 1000);
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function deepSortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortObject);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) out[k] = deepSortObject(obj[k]);
  return out;
}

export function verifyNowPaymentsSignature(rawBody: string, secret: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const sorted = deepSortObject(parsed);
  const message = JSON.stringify(sorted);
  const digest = crypto.createHmac("sha512", secret).update(message).digest("hex");
  try {
    const expected = Buffer.from(digest, "hex");
    const actual = Buffer.from(signatureHeader, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function mapNowPaymentsStatus(status: string) {
  const s = (status ?? "").toLowerCase();
  // Common statuses: waiting / confirming / confirmed / sending / partially_paid / finished / failed / expired / refunded
  if (s === "finished") return "SUCCEEDED" as const;
  if (s === "failed") return "FAILED" as const;
  if (s === "expired") return "EXPIRED" as const;
  if (s === "refunded") return "REFUNDED" as const;
  // Treat others as pending
  return "PENDING" as const;
}

export async function createNowPaymentsPayment(params: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
}) {
  const apiKey = requireNowPaymentsApiKey();
  const res = await fetch(`${NOWPAYMENTS_API_BASE}/v1/payment`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      price_amount: params.priceAmount,
      price_currency: params.priceCurrency,
      pay_currency: params.payCurrency,
      order_id: params.orderId,
      order_description: params.orderDescription,
      ipn_callback_url: params.ipnCallbackUrl,
    }),
  });

  const rawText = await res.text().catch(() => "");
  let json: Json = {};
  try {
    json = JSON.parse(rawText) as Json;
  } catch {
    // response was not JSON (e.g. HTML error page or empty body)
  }
  if (!res.ok) {
    const code = typeof json.code === "string" ? json.code : undefined;
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));
    const message =
      typeof json.message === "string"
        ? json.message
        : `NowPayments create payment failed (HTTP ${res.status}): ${rawText || "(empty body)"}`;
    throw new NowPaymentsApiError(message, { statusCode: res.status, code, payload: json, retryAfterSeconds });
  }
  return json as {
    payment_id: number | string;
    pay_address?: string;
    pay_amount?: number | string;
    pay_currency?: string;
    price_amount?: number | string;
    price_currency?: string;
  };
}

export async function getNowPaymentsMinAmount(currencyFrom: string) {
  const key = currencyFrom.toLowerCase();

  // In-memory cache to reduce NowPayments QPS (preview calls this frequently).
  // Fresh TTL keeps values up-to-date; stale fallback prevents UX breakage during intermittent outages/429s.
  const FRESH_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const cached = minAmountCache[key];
  if (cached && Date.now() - cached.fetchedAt < FRESH_TTL_MS) {
    return cached.data;
  }

  const apiKey = requireNowPaymentsApiKey();
  const url = new URL(`${NOWPAYMENTS_API_BASE}/v1/min-amount`);
  url.searchParams.set("currency_from", currencyFrom);
  url.searchParams.set("fiat_equivalent", "usd");

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });

    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      // If we have a cached value, fall back to it during transient provider issues.
      if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) {
        return cached.data;
      }
      throw new Error(`Failed to fetch min amount: ${JSON.stringify(json)}`);
    }

    const next = {
      currency_from: typeof json.currency_from === "string" ? json.currency_from : currencyFrom,
      min_amount: toNumber(json.min_amount) ?? 0,
      fiat_equivalent: toNumber(json.fiat_equivalent) ?? 0,
    };

    minAmountCache[key] = { fetchedAt: Date.now(), data: next };
    return next;
  } catch (err) {
    // If the request itself failed (network/timeout), fall back to cache if possible.
    if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) {
      return cached.data;
    }
    throw err;
  }
}

const minAmountCache: Record<
  string,
  {
    fetchedAt: number;
    data: { currency_from: string; min_amount: number; fiat_equivalent: number };
  }
> = {};

export async function estimateNowPaymentsPrice(params: {
  amount: number;
  currencyFrom: string;
  currencyTo: string;
}) {
  const apiKey = requireNowPaymentsApiKey();
  const url = new URL(`${NOWPAYMENTS_API_BASE}/v1/estimate`);
  url.searchParams.set("amount", params.amount.toString());
  url.searchParams.set("currency_from", params.currencyFrom);
  url.searchParams.set("currency_to", params.currencyTo);

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
  });

  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    throw new Error(`Failed to fetch estimate: ${JSON.stringify(json)}`);
  }

  return json as {
    currency_from: string;
    amount_from: number;
    currency_to: string;
    estimated_amount: number;
    estimated_exchange_rate: number;
  };
}

export async function updateNowPaymentsMerchantEstimate(paymentId: string) {
  const apiKey = requireNowPaymentsApiKey();
  const res = await fetch(`${NOWPAYMENTS_API_BASE}/v1/payment/${paymentId}/update-merchant-estimate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
  });

  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    throw new Error(`Failed to update merchant estimate: ${JSON.stringify(json)}`);
  }

  return json as {
    id: string;
    token_id: string;
    pay_amount: number;
    expiration_estimate_date: string;
  };
}

type NowPaymentsFullCurrency = {
  id: number;
  code: string;
  name: string;
  enable: boolean;
  logo_url?: string | null;
  track?: boolean;
  priority?: number | null;
  network?: string | null;
};

let fullCurrenciesCache:
  | { fetchedAt: number; currencies: NowPaymentsFullCurrency[] }
  | null = null;

export async function getNowPaymentsFullCurrencies(): Promise<NowPaymentsFullCurrency[]> {
  const apiKey = requireNowPaymentsApiKey();

  const ttlMs = 5 * 60 * 1000; // 5 minutes
  if (fullCurrenciesCache && Date.now() - fullCurrenciesCache.fetchedAt < ttlMs) {
    return fullCurrenciesCache.currencies;
  }

  const res = await fetch(`${NOWPAYMENTS_API_BASE}/v1/full-currencies`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });

  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(`Failed to fetch full currencies: ${JSON.stringify(json)}`);
  }

  // API returns { currencies: [...] }
  const parsed = z
    .object({
      currencies: z.array(
        z.object({
          id: z.number().optional(),
          code: z.string(),
          name: z.string().optional(),
          enable: z.boolean().optional(),
          logo_url: z.string().nullable().optional(),
          track: z.boolean().optional(),
          priority: z.number().nullable().optional(),
          network: z.string().nullable().optional(),
        })
      ),
    })
    .safeParse(json);

  const currencies: NowPaymentsFullCurrency[] = parsed.success
    ? parsed.data.currencies.map((c) => ({
        id: typeof c.id === "number" ? c.id : 0,
        code: c.code,
        name: typeof c.name === "string" ? c.name : c.code,
        enable: typeof c.enable === "boolean" ? c.enable : true,
        logo_url: c.logo_url ?? null,
        track: c.track,
        priority: c.priority ?? null,
        network: c.network ?? null,
      }))
    : [];

  fullCurrenciesCache = { fetchedAt: Date.now(), currencies };
  return currencies;
}

type NowPaymentsPaymentStatusResponse = {
  payment_id: number | string;
  payment_status: string;
  pay_address?: string | null;
  pay_amount?: number | string | null;
  pay_currency?: string | null;
  actually_paid?: number | string | null;
  payin_hash?: string | null;
  payout_hash?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const paymentStatusCache: Record<string, { fetchedAt: number; data: NowPaymentsPaymentStatusResponse }> = {};

export async function getNowPaymentsPaymentStatus(npPaymentId: string): Promise<NowPaymentsPaymentStatusResponse> {
  const apiKey = requireNowPaymentsApiKey();
  const key = String(npPaymentId);
  const ttlMs = 2_000; // called by UI polling; keep light
  const cached = paymentStatusCache[key];
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.data;

  const res = await fetch(`${NOWPAYMENTS_API_BASE}/v1/payment/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(`Failed to fetch payment status: ${JSON.stringify(json)}`);
  }

  const parsed = z
    .object({
      payment_id: z.number().or(z.string()),
      payment_status: z.string(),
      pay_address: z.string().nullable().optional(),
      pay_amount: z.number().or(z.string()).nullable().optional(),
      pay_currency: z.string().nullable().optional(),
      actually_paid: z.number().or(z.string()).nullable().optional(),
      payin_hash: z.string().nullable().optional(),
      payout_hash: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      updated_at: z.string().nullable().optional(),
    })
    .safeParse(json);

  if (!parsed.success) {
    throw new Error(`Invalid payment status payload: ${JSON.stringify(json)}`);
  }

  const data: NowPaymentsPaymentStatusResponse = parsed.data;
  paymentStatusCache[key] = { fetchedAt: Date.now(), data };
  return data;
}

export const nowpaymentsProvider: PaymentProvider = {
  async confirmPayment(params: { checkoutSessionId?: string; gatewayTransactionId?: string }) {
    // checkoutSessionId or gatewayTransactionId is the NowPayments payment_id
    const npPaymentId = params.checkoutSessionId ?? params.gatewayTransactionId;
    if (!npPaymentId) {
      return { isPaid: false };
    }

    try {
      const status = await getNowPaymentsPaymentStatus(npPaymentId);
      const mapped = mapNowPaymentsStatus(status.payment_status);
      return {
        isPaid: mapped === "SUCCEEDED",
        gatewayTransactionId: String(status.payment_id),
      };
    } catch {
      return { isPaid: false };
    }
  },

  async createPayment({ payment, order }: { payment: ProviderPayment; order: ProviderOrder }) {
    // Scheme A:
    // Do NOT call NowPayments during `order.checkout`.
    // We return our own hosted crypto payment page URL immediately, then the page will create the NowPayments invoice lazily.
    const callbackBase = (() => {
      const u = payment.extra?.SuccessURL ?? env.APP_URL ?? "";
      try {
        return new URL(u).origin;
      } catch {
        return env.APP_URL ?? "";
      }
    })();

    // Redirect to our own hosted crypto checkout page for a unified UX
    const base = callbackBase || env.APP_URL || "";
    const from = (() => {
      const cancel = payment.extra?.CancelURL;
      if (typeof cancel !== "string" || !cancel) return "";
      try {
        return new URL(cancel).searchParams.get("from") ?? "";
      } catch {
        return "";
      }
    })();
    const url = `${base}/payment/crypto?paymentId=${encodeURIComponent(payment.id)}&orderId=${encodeURIComponent(order.id)}${from ? `&from=${encodeURIComponent(from)}` : ""}`;

    return {
      paymentUrl: url,
    };
  },

  async createSubscription({ payment, order }: { payment: ProviderPayment; order: ProviderOrder }) {
    // Same as createPayment: return hosted URL, lazily create NowPayments invoice on the payment page.
    const callbackBase = (() => {
      const u = payment.extra?.SuccessURL ?? env.APP_URL ?? "";
      try {
        return new URL(u).origin;
      } catch {
        return env.APP_URL ?? "";
      }
    })();

    const base = callbackBase || env.APP_URL || "";
    const from = (() => {
      const cancel = payment.extra?.CancelURL;
      if (typeof cancel !== "string" || !cancel) return "";
      try {
        return new URL(cancel).searchParams.get("from") ?? "";
      } catch {
        return "";
      }
    })();
    const url = `${base}/payment/crypto?paymentId=${encodeURIComponent(payment.id)}&orderId=${encodeURIComponent(order.id)}${from ? `&from=${encodeURIComponent(from)}` : ""}`;

    return {
      paymentUrl: url,
    };
  },

  async handlePaymentWebhook(req: Request) {
    const rawBody = await req.text();
    const sig = req.headers.get("x-nowpayments-sig");

    // Verify signature if secret exists; if missing secret treat as invalid
    if (!env.NOWPAYMENTS_IPN_SECRET) return null;
    if (!verifyNowPaymentsSignature(rawBody, env.NOWPAYMENTS_IPN_SECRET, sig)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }

    const data = nowpaymentsIpnSchema.safeParse(parsed);
    if (!data.success) return null;

    const status = mapNowPaymentsStatus(data.data.payment_status);
    const gatewayTransactionId = String(data.data.payment_id);
    const paymentId = data.data.order_id; // we set order_id=payment.id

    // Normalize to cents for analytics/notifications where needed
    const priceAmount = toNumber(data.data.price_amount);
    const amountCents = typeof priceAmount === "number" ? Math.round(priceAmount * 100) : undefined;
    const currency =
      typeof data.data.price_currency === "string" ? data.data.price_currency.toLowerCase() : undefined;

    return new BaseWebhookResult({
      status,
      gatewayTransactionId,
      amount: amountCents,
      currency,
      rawData: {
        ...(data.data as unknown as Json),
        metadata: {
          paymentId,
        },
      },
    });
  },

  async handleSubscriptionWebhook() {
    return null;
  },
};

