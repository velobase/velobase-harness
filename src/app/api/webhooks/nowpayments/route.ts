import { MODULES } from "@/config/modules";
import { initOrderProviders } from "@/server/order/services/init-providers";
import { handlePaymentWebhook } from "@/server/order/services/handle-webhooks";
import { db } from "@/server/db";
import { verifyNowPaymentsSignature } from "@/server/order/providers/nowpayments";
import { env } from "@/server/shared/env";
import type { Prisma } from "@prisma/client";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function webhookField(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export async function POST(req: Request) {
  if (!MODULES.integrations.payment.nowpayments.enabled) {
    return new Response(null, { status: 404 });
  }

  initOrderProviders();

  const rawBody = await req.clone().text();
  const signature = req.headers.get("x-nowpayments-sig");

  if (!env.NOWPAYMENTS_IPN_SECRET) {
    return jsonResponse({ ok: false, error: "NowPayments webhook secret is not configured" }, 500);
  }

  if (!verifyNowPaymentsSignature(rawBody, env.NOWPAYMENTS_IPN_SECRET, signature)) {
    return jsonResponse({ ok: false, error: "Invalid NowPayments webhook signature" }, 401);
  }

  let eventId: string | null = null;
  let logId: string | null = null;
  let parsed: Prisma.JsonObject;
  try {
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonResponse({ ok: false, error: "Invalid NowPayments webhook payload" }, 400);
    }
    parsed = value as Prisma.JsonObject;
    const pid = webhookField(parsed.payment_id) ?? "unknown";
    const st = typeof parsed.payment_status === "string" ? parsed.payment_status : "unknown";
    const ts = webhookField(parsed.updated_at) ?? "";
    const oid = webhookField(parsed.order_id) ?? "";
    eventId = [pid, st, ts || oid || "no_ts"].filter(Boolean).join("_");

    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: "NOWPAYMENTS", eventId } },
      create: {
        gateway: "NOWPAYMENTS",
        eventId,
        eventType: `payment.${st}`,
        status: "RECEIVED",
        payload: parsed,
      },
      update: {
        status: "RECEIVED",
      },
    });
    logId = log.id;
  } catch {
    return jsonResponse({ ok: false, error: "Malformed NowPayments webhook payload" }, 400);
  }

  try {
    const paymentResult = await handlePaymentWebhook("NOWPAYMENTS", req);

    if (logId) {
      const isIgnored =
        !!paymentResult &&
        typeof paymentResult === "object" &&
        "status" in paymentResult &&
        (paymentResult as { status?: unknown }).status === "ignored";
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: isIgnored ? "IGNORED" : "PROCESSED", processedAt: new Date() },
      });
    }

    return Response.json({ ok: true, payment: paymentResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: message, processedAt: new Date() },
      });
    }

    return jsonResponse({ ok: false, error: message }, 400);
  }
}
