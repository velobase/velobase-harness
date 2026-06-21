import { MODULES } from "@/config/modules";
import { db } from "@/server/db";
import {
  handlePaymentWebhook,
  handleSubscriptionWebhook,
  WebhookFulfillmentError,
} from "@/server/order/services/handle-webhooks";
import { initOrderProviders } from "@/server/order/services/init-providers";
import { verifyLemonSqueezySignature } from "@/server/order/providers/lemonsqueezy";
import type { Prisma } from "@prisma/client";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function eventField(value: unknown): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return undefined;
}

function isIgnoredWebhookResult(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status?: unknown }).status === "ignored"
  );
}

export async function POST(req: Request) {
  if (!MODULES.integrations.payment.lemonsqueezy.enabled) {
    return new Response(null, { status: 404 });
  }

  initOrderProviders();

  const rawBody = await req.clone().text();
  const signature = req.headers.get("x-signature");

  if (!signature) {
    return jsonResponse({ ok: false, error: "Missing x-signature" }, 400);
  }

  if (!verifyLemonSqueezySignature(rawBody, signature)) {
    return jsonResponse(
      { ok: false, error: "Invalid LemonSqueezy webhook signature" },
      401,
    );
  }

  let logId: string | null = null;
  try {
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonResponse(
        { ok: false, error: "Invalid LemonSqueezy webhook payload" },
        400,
      );
    }

    const parsed = value as Prisma.JsonObject;
    const meta =
      parsed.meta && typeof parsed.meta === "object"
        ? (parsed.meta as Record<string, unknown>)
        : {};
    const data =
      parsed.data && typeof parsed.data === "object"
        ? (parsed.data as Record<string, unknown>)
        : {};
    const attributes =
      data.attributes && typeof data.attributes === "object"
        ? (data.attributes as Record<string, unknown>)
        : {};
    const eventType =
      eventField(meta.event_name) ??
      req.headers.get("x-event-name") ??
      "unknown";
    const dataId = eventField(data.id) ?? "unknown";
    const timestamp =
      eventField(attributes.updated_at) ??
      eventField(attributes.created_at) ??
      eventField(meta.webhook_id) ??
      "";
    const eventId = [eventType, dataId, timestamp || "no_ts"]
      .filter(Boolean)
      .join("_");

    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: "LEMONSQUEEZY", eventId } },
      create: {
        gateway: "LEMONSQUEEZY",
        eventId,
        eventType,
        status: "RECEIVED",
        payload: parsed,
      },
      update: {
        status: "RECEIVED",
      },
    });
    logId = log.id;
  } catch {
    return jsonResponse(
      { ok: false, error: "Malformed LemonSqueezy webhook payload" },
      400,
    );
  }

  try {
    const paymentResult = await handlePaymentWebhook(
      "LEMONSQUEEZY",
      req.clone(),
    );
    const subscriptionResult = await handleSubscriptionWebhook(
      "LEMONSQUEEZY",
      req,
    );

    if (logId) {
      const isIgnored =
        isIgnoredWebhookResult(paymentResult) &&
        isIgnoredWebhookResult(subscriptionResult);
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: {
          status: isIgnored ? "IGNORED" : "PROCESSED",
          processedAt: new Date(),
        },
      });
    }

    return Response.json({
      ok: true,
      payment: paymentResult,
      subscription: subscriptionResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: message, processedAt: new Date() },
      });
    }

    if (err instanceof WebhookFulfillmentError) {
      return jsonResponse({ ok: false, error: message }, 500);
    }

    return jsonResponse({ ok: false, error: message }, 400);
  }
}
