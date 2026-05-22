import crypto from "crypto";
import type {
  PaymentAdapter,
  CheckoutRequest,
  CheckoutResponse,
  WebhookEvent,
} from "./types";
import { env } from "@/server/shared/env";

const LEMONSQUEEZY_API_BASE = "https://api.lemonsqueezy.com/v1";

type JsonRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireApiKey(): string {
  if (!env.LEMONSQUEEZY_API_KEY) throw new Error("LEMONSQUEEZY_API_KEY is required");
  return env.LEMONSQUEEZY_API_KEY;
}

function requireStoreId(): string {
  if (!env.LEMONSQUEEZY_STORE_ID) throw new Error("LEMONSQUEEZY_STORE_ID is required");
  return env.LEMONSQUEEZY_STORE_ID;
}

function getVariantId(params: CheckoutRequest): string {
  const meta = params.productMetadata;
  const nested = meta?.lemonsqueezy && typeof meta.lemonsqueezy === "object"
    ? (meta.lemonsqueezy as JsonRecord) : {};
  const candidate = meta && typeof meta === "object"
    ? nested.variantId ?? nested.variant_id ??
      (meta as JsonRecord).lemonsqueezyVariantId ??
      (meta as JsonRecord).lemonsqueezy_variant_id ??
      (meta as JsonRecord).lemonSqueezyVariantId
    : undefined;
  if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();

  if (env.NODE_ENV !== "production") {
    const testVariantId = params.mode === "subscription"
      ? env.LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID
      : env.LEMONSQUEEZY_TEST_VARIANT_ID;
    if (testVariantId && testVariantId.trim().length > 0) return testVariantId.trim();
  }

  throw new Error("LemonSqueezy variant id is required in product metadata");
}

async function lemonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${LEMONSQUEEZY_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${requireApiKey()}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as JsonRecord) : {};
  if (!res.ok) throw new Error(`LemonSqueezy API request failed (${res.status}): ${text || "(empty body)"}`);
  return json;
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET || !signatureHeader) return false;
  const digest = Buffer.from(
    crypto.createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET).update(rawBody).digest("hex"),
    "utf8",
  );
  const signature = Buffer.from(signatureHeader, "utf8");
  return digest.length === signature.length && crypto.timingSafeEqual(digest, signature);
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function toAmountCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// LemonSqueezy Adapter
// ---------------------------------------------------------------------------

export const lemonsqueezyAdapter: PaymentAdapter = {
  name: "LEMONSQUEEZY",

  async createCheckout(params: CheckoutRequest): Promise<CheckoutResponse> {
    const storeId = requireStoreId();
    const variantId = getVariantId(params);
    const custom: Record<string, string> = {
      orderId: params.orderId,
      paymentId: params.paymentId,
      isSubscription: String(params.mode === "subscription"),
    };
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) custom[k] = v;
    }

    const json = await lemonFetch("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            custom_price: params.amount,
            product_options: {
              name: params.productName,
              redirect_url: params.successUrl,
              enabled_variants: [Number(variantId)],
            },
            checkout_data: { custom },
            test_mode: env.LEMONSQUEEZY_TEST_MODE ?? env.NODE_ENV !== "production",
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });

    const data = json.data && typeof json.data === "object" ? (json.data as JsonRecord) : {};
    const attributes = data.attributes && typeof data.attributes === "object" ? (data.attributes as JsonRecord) : {};
    const checkoutId = typeof data.id === "string" ? data.id : undefined;
    const url = typeof attributes.url === "string" ? attributes.url : undefined;
    if (!url) throw new Error("LemonSqueezy checkout URL missing");

    return {
      url,
      checkoutId,
      extra: { checkoutId, storeId, variantId },
    };
  },

  async confirmPayment(): Promise<{ paid: boolean }> {
    return { paid: false };
  },

  async parseWebhook(req: Request): Promise<WebhookEvent[]> {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");
    if (!verifySignature(rawBody, signature)) return [];

    const payload = JSON.parse(rawBody) as JsonRecord;
    const meta = payload.meta && typeof payload.meta === "object" ? (payload.meta as JsonRecord) : {};
    const data = payload.data && typeof payload.data === "object" ? (payload.data as JsonRecord) : {};
    const attributes = data.attributes && typeof data.attributes === "object" ? (data.attributes as JsonRecord) : {};
    const customData = meta.custom_data && typeof meta.custom_data === "object" ? (meta.custom_data as JsonRecord) : {};
    const eventName =
      (typeof meta.event_name === "string" ? meta.event_name : undefined) ??
      req.headers.get("x-event-name") ?? "";

    const id = typeof data.id === "string" ? data.id : undefined;
    const metadata: Record<string, string> = {};
    if (typeof customData.paymentId === "string") metadata.paymentId = customData.paymentId;
    if (typeof customData.orderId === "string") metadata.orderId = customData.orderId;

    // ── One-time payment ──
    if (eventName === "order_created") {
      if (customData.isSubscription === "true") return [{ type: "ignored", raw: payload }];
      return [{
        type: "payment.succeeded",
        transactionId: id,
        amount: toAmountCents(attributes.total),
        currency: typeof attributes.currency === "string" ? attributes.currency.toLowerCase() : undefined,
        metadata,
        raw: payload,
      }];
    }

    // ── Subscription activated ──
    if (eventName === "subscription_created") {
      return [{
        type: "subscription.activated",
        transactionId: typeof attributes.order_id === "number" ? String(attributes.order_id) : undefined,
        subscriptionId: id,
        metadata,
        raw: payload,
      }];
    }

    // ── Subscription payment success / recovery ──
    if (eventName === "subscription_payment_success" || eventName === "subscription_payment_recovered") {
      const billingReason = typeof attributes.billing_reason === "string" ? attributes.billing_reason : "";
      const subscriptionId =
        typeof attributes.subscription_id === "number" ? String(attributes.subscription_id)
          : typeof attributes.subscription_id === "string" ? attributes.subscription_id : undefined;

      const isRenewal = billingReason === "renewal" || billingReason === "updated";
      return [{
        type: isRenewal ? "subscription.renewed" : "subscription.activated",
        transactionId: id,
        subscriptionId,
        amount: toAmountCents(attributes.total),
        currency: typeof attributes.currency === "string" ? attributes.currency.toLowerCase() : undefined,
        metadata,
        raw: payload,
      }];
    }

    // ── Subscription payment failed ──
    if (eventName === "subscription_payment_failed") {
      const subscriptionId =
        typeof attributes.subscription_id === "number" ? String(attributes.subscription_id)
          : typeof attributes.subscription_id === "string" ? attributes.subscription_id : undefined;
      return [{
        type: "subscription.payment_failed",
        transactionId: id,
        subscriptionId,
        amount: toAmountCents(attributes.total),
        currency: typeof attributes.currency === "string" ? attributes.currency.toLowerCase() : undefined,
        metadata,
        raw: payload,
      }];
    }

    // ── Subscription lifecycle ──
    if (
      eventName === "subscription_updated" ||
      eventName === "subscription_cancelled" ||
      eventName === "subscription_resumed" ||
      eventName === "subscription_paused" ||
      eventName === "subscription_unpaused"
    ) {
      const cancelled = attributes.cancelled === true || eventName === "subscription_cancelled";
      const endsAt = toDate(attributes.ends_at);
      return [{
        type: "subscription.updated",
        subscriptionId: id,
        subscription: {
          cancelAtPeriodEnd: cancelled,
          cancelAt: cancelled ? endsAt : null,
          canceledAt: cancelled ? new Date() : null,
          endedAt: null,
        },
        raw: payload,
      }];
    }

    if (eventName === "subscription_expired") {
      const endsAt = toDate(attributes.ends_at);
      return [{
        type: "subscription.canceled",
        subscriptionId: id,
        subscription: {
          cancelAtPeriodEnd: false,
          cancelAt: null,
          canceledAt: toDate(attributes.ends_at),
          endedAt: endsAt ?? new Date(),
        },
        raw: payload,
      }];
    }

    return [{ type: "ignored", raw: payload }];
  },
};
