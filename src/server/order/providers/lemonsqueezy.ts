import crypto from "crypto";

import { env } from "@/server/shared/env";
import {
  BaseWebhookResult,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
} from "./types";

const LEMONSQUEEZY_API_BASE = "https://api.lemonsqueezy.com/v1";

type JsonRecord = Record<string, unknown>;

function requireLemonSqueezyApiKey(): string {
  if (!env.LEMONSQUEEZY_API_KEY) {
    throw new Error("LEMONSQUEEZY_API_KEY is required");
  }
  return env.LEMONSQUEEZY_API_KEY;
}

function requireLemonSqueezyStoreId(): string {
  if (!env.LEMONSQUEEZY_STORE_ID) {
    throw new Error("LEMONSQUEEZY_STORE_ID is required");
  }
  return env.LEMONSQUEEZY_STORE_ID;
}

function getLemonSqueezyVariantId(
  order: ProviderOrder,
  isSubscription: boolean,
): string {
  const metadata = order.productSnapshot?.metadata;
  const meta =
    metadata && typeof metadata === "object" ? (metadata as JsonRecord) : {};
  const nested =
    meta.lemonsqueezy && typeof meta.lemonsqueezy === "object"
      ? (meta.lemonsqueezy as JsonRecord)
      : {};
  const candidate =
    nested.variantId ??
    nested.variant_id ??
    meta.lemonsqueezyVariantId ??
    meta.lemonsqueezy_variant_id ??
    meta.lemonSqueezyVariantId;

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return String(candidate);
  }
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }

  if (env.NODE_ENV !== "production") {
    const fallback = isSubscription
      ? env.LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID
      : env.LEMONSQUEEZY_TEST_VARIANT_ID;
    if (fallback && fallback.trim().length > 0) {
      return fallback.trim();
    }
  }

  throw new Error("LemonSqueezy variant id is required in product metadata");
}

function toLemonCustomData(
  payment: ProviderPayment,
  order: ProviderOrder,
  isSubscription: boolean,
): Record<string, string> {
  const metadata =
    payment.extra &&
    typeof payment.extra === "object" &&
    payment.extra.metadata &&
    typeof payment.extra.metadata === "object"
      ? (payment.extra.metadata as JsonRecord)
      : undefined;

  const custom: Record<string, string> = {
    orderId: order.id,
    paymentId: payment.id,
    isSubscription: String(isSubscription),
  };

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        custom[key] = String(value);
      }
    }
  }

  return custom;
}

async function lemonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${LEMONSQUEEZY_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${requireLemonSqueezyApiKey()}`,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as JsonRecord) : {};
  if (!res.ok) {
    throw new Error(
      `LemonSqueezy API request failed (${res.status}): ${
        text || "(empty body)"
      }`,
    );
  }
  return json;
}

async function createCheckout(params: {
  payment: ProviderPayment;
  order: ProviderOrder;
  isSubscription: boolean;
}) {
  const storeId = requireLemonSqueezyStoreId();
  const variantId = getLemonSqueezyVariantId(
    params.order,
    params.isSubscription,
  );
  const custom = toLemonCustomData(
    params.payment,
    params.order,
    params.isSubscription,
  );
  const successUrl =
    typeof params.payment.extra?.SuccessURL === "string"
      ? params.payment.extra.SuccessURL
      : undefined;
  const cancelUrl =
    typeof params.payment.extra?.CancelURL === "string"
      ? params.payment.extra.CancelURL
      : undefined;

  const json = await lemonFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          custom_price: params.order.amount,
          product_options: {
            name: params.order.productSnapshot?.name ?? "Product",
            redirect_url: successUrl,
            enabled_variants: [Number(variantId)],
          },
          checkout_options: {
            embed: false,
          },
          checkout_data: {
            custom,
          },
          test_mode:
            env.LEMONSQUEEZY_TEST_MODE ?? env.NODE_ENV !== "production",
        },
        relationships: {
          store: {
            data: { type: "stores", id: storeId },
          },
          variant: {
            data: { type: "variants", id: variantId },
          },
        },
      },
    }),
  });

  const data =
    json.data && typeof json.data === "object" ? (json.data as JsonRecord) : {};
  const attributes =
    data.attributes && typeof data.attributes === "object"
      ? (data.attributes as JsonRecord)
      : {};
  const checkoutId = typeof data.id === "string" ? data.id : undefined;
  const url = typeof attributes.url === "string" ? attributes.url : undefined;

  if (!url) throw new Error("LemonSqueezy checkout URL missing");

  return {
    paymentUrl: url,
    checkoutSessionId: checkoutId,
    providerExtra: {
      checkoutId,
      storeId,
      variantId,
      cancelUrl,
    },
  };
}

export function verifyLemonSqueezySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET || !signatureHeader) return false;
  const digest = Buffer.from(
    crypto
      .createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex"),
    "utf8",
  );
  const signature = Buffer.from(signatureHeader, "utf8");
  return (
    digest.length === signature.length &&
    crypto.timingSafeEqual(digest, signature)
  );
}

function parseWebhook(rawBody: string, req: Request) {
  const signature = req.headers.get("x-signature");
  if (!verifyLemonSqueezySignature(rawBody, signature)) return null;

  const payload = JSON.parse(rawBody) as JsonRecord;
  const meta =
    payload.meta && typeof payload.meta === "object"
      ? (payload.meta as JsonRecord)
      : {};
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as JsonRecord)
      : {};
  const attributes =
    data.attributes && typeof data.attributes === "object"
      ? (data.attributes as JsonRecord)
      : {};
  const customData =
    meta.custom_data && typeof meta.custom_data === "object"
      ? (meta.custom_data as JsonRecord)
      : {};
  const eventName =
    (typeof meta.event_name === "string" ? meta.event_name : undefined) ??
    req.headers.get("x-event-name") ??
    "";

  return { payload, data, attributes, customData, eventName };
}

function metadataFromCustomData(customData: JsonRecord) {
  return {
    paymentId:
      typeof customData.paymentId === "string"
        ? customData.paymentId
        : undefined,
    orderId:
      typeof customData.orderId === "string" ? customData.orderId : undefined,
  };
}

function toAmountCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeSubscriptionStatus(attributes: JsonRecord) {
  const status = typeof attributes.status === "string" ? attributes.status : "";
  if (status === "active" || status === "on_trial" || status === "cancelled") {
    return "SUCCEEDED" as const;
  }
  if (status === "expired") return "EXPIRED" as const;
  return "FAILED" as const;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function subscriptionIdFromAttributes(
  attributes: JsonRecord,
): string | undefined {
  if (typeof attributes.subscription_id === "number") {
    return String(attributes.subscription_id);
  }
  if (typeof attributes.subscription_id === "string") {
    return attributes.subscription_id;
  }
  return undefined;
}

export const lemonsqueezyProvider: PaymentProvider = {
  createPayment({ payment, order }) {
    return createCheckout({ payment, order, isSubscription: false });
  },

  createSubscription({ payment, order }) {
    return createCheckout({ payment, order, isSubscription: true });
  },

  async confirmPayment() {
    return { isPaid: false };
  },

  async handlePaymentWebhook(req: Request) {
    const rawBody = await req.text();
    const parsed = parseWebhook(rawBody, req);
    if (!parsed) return null;

    const { payload, data, attributes, customData, eventName } = parsed;
    const metadata = metadataFromCustomData(customData);
    const id = typeof data.id === "string" ? data.id : undefined;

    if (eventName === "order_created") {
      if (customData.isSubscription === "true") return null;
      return new BaseWebhookResult({
        status: "SUCCEEDED",
        gatewayTransactionId: id,
        amount: toAmountCents(attributes.total),
        currency:
          typeof attributes.currency === "string"
            ? attributes.currency.toLowerCase()
            : undefined,
        rawData: { ...payload, metadata },
      });
    }

    if (eventName === "subscription_created") {
      return new BaseWebhookResult({
        status: "SUCCEEDED",
        gatewayTransactionId:
          typeof attributes.order_id === "number"
            ? String(attributes.order_id)
            : undefined,
        gatewaySubscriptionId: id,
        rawData: { ...payload, metadata },
      });
    }

    return null;
  },

  async handleSubscriptionWebhook(req: Request) {
    const rawBody = await req.text();
    const parsed = parseWebhook(rawBody, req);
    if (!parsed) return null;

    const { payload, data, attributes, eventName } = parsed;
    const id = typeof data.id === "string" ? data.id : undefined;

    if (
      eventName === "subscription_payment_success" ||
      eventName === "subscription_payment_recovered"
    ) {
      const billingReason =
        typeof attributes.billing_reason === "string"
          ? attributes.billing_reason
          : "";
      const subscriptionId = subscriptionIdFromAttributes(attributes);

      return new BaseWebhookResult({
        status: "SUCCEEDED",
        gatewayTransactionId: id,
        gatewaySubscriptionId: subscriptionId,
        subscriptionPeriod:
          billingReason === "renewal" || billingReason === "updated" ? 2 : 1,
        amount: toAmountCents(attributes.total),
        currency:
          typeof attributes.currency === "string"
            ? attributes.currency.toLowerCase()
            : undefined,
        rawData: payload,
        isSubscription: true,
      });
    }

    if (eventName === "subscription_payment_failed") {
      const subscriptionId = subscriptionIdFromAttributes(attributes);
      return new BaseWebhookResult({
        status: "FAILED",
        gatewayTransactionId: id,
        gatewaySubscriptionId: subscriptionId,
        amount: toAmountCents(attributes.total),
        currency:
          typeof attributes.currency === "string"
            ? attributes.currency.toLowerCase()
            : undefined,
        rawData: payload,
        isSubscription: true,
      });
    }

    if (
      eventName === "subscription_created" ||
      eventName === "subscription_updated" ||
      eventName === "subscription_cancelled" ||
      eventName === "subscription_resumed" ||
      eventName === "subscription_expired" ||
      eventName === "subscription_paused" ||
      eventName === "subscription_unpaused"
    ) {
      const status =
        eventName === "subscription_expired"
          ? "EXPIRED"
          : normalizeSubscriptionStatus(attributes);
      const cancelled =
        attributes.cancelled === true || eventName === "subscription_cancelled";
      const endsAt = toDate(attributes.ends_at);

      return new BaseWebhookResult({
        status,
        gatewaySubscriptionId: id,
        rawData: payload,
        isSubscription: true,
        normalizedData: {
          cancelAtPeriodEnd: cancelled && status !== "EXPIRED",
          cancelAt: cancelled ? endsAt : null,
          canceledAt: cancelled ? new Date() : null,
          endedAt: status === "EXPIRED" ? (endsAt ?? new Date()) : null,
        },
      });
    }

    return null;
  },
};
