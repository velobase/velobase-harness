import { db } from "@/server/db";
import { logger } from "@/server/shared/telemetry/logger";
import { processWebhook, WebhookFulfillmentError } from "./webhook-pipeline";

export async function handleWebhookRoute(adapterName: string, req: Request): Promise<Response> {
  let logId: string | null = null;

  // Best-effort pre-parse for logging
  try {
    const rawBody = await req.clone().text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* empty */ }

    const eventId = deriveEventId(adapterName, parsed, req);
    const eventType = deriveEventType(adapterName, parsed, req);

    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: adapterName, eventId } },
      create: { gateway: adapterName, eventId, eventType, status: "RECEIVED", payload: parsed as object },
      update: { status: "RECEIVED" },
    });
    logId = log.id;
  } catch {
    // Non-critical — proceed with processing
  }

  try {
    const result = await processWebhook(adapterName, req);

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "PROCESSED", processedAt: new Date() },
      }).catch(() => undefined);
    }

    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: message, processedAt: new Date() },
      }).catch(() => undefined);
    }

    if (err instanceof WebhookFulfillmentError) {
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    logger.warn({ err, adapter: adapterName }, "Webhook processing error (returning 200 to avoid retries)");
    return Response.json({ ok: false, error: message });
  }
}

// ---------------------------------------------------------------------------
// Event ID / type derivation for log dedup
// ---------------------------------------------------------------------------

function deriveEventId(adapter: string, parsed: Record<string, unknown>, req: Request): string {
  switch (adapter) {
    case "STRIPE": {
      return typeof parsed.id === "string" ? parsed.id : `stripe_${Date.now()}`;
    }
    case "NOWPAYMENTS": {
      const rawPid = parsed.payment_id;
      const pid = typeof rawPid === "string" ? rawPid : typeof rawPid === "number" ? rawPid.toString() : "unknown";
      const st = typeof parsed.payment_status === "string" ? parsed.payment_status : "unknown";
      const ts = typeof parsed.updated_at === "string" ? parsed.updated_at : "";
      return [pid, st, ts || "no_ts"].filter(Boolean).join("_");
    }
    case "LEMONSQUEEZY": {
      const meta = parsed.meta && typeof parsed.meta === "object" ? (parsed.meta as Record<string, unknown>) : {};
      const data = parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : {};
      const attrs = data.attributes && typeof data.attributes === "object" ? (data.attributes as Record<string, unknown>) : {};
      const eventType = typeof meta.event_name === "string" ? meta.event_name : req.headers.get("x-event-name") ?? "unknown";
      const dataId = typeof data.id === "string" ? data.id : "unknown";
      const timestamp = typeof attrs.updated_at === "string" ? attrs.updated_at : typeof attrs.created_at === "string" ? attrs.created_at : "";
      return [eventType, dataId, timestamp].filter(Boolean).join("_");
    }
    default:
      return `${adapter}_${Date.now()}`;
  }
}

function deriveEventType(adapter: string, parsed: Record<string, unknown>, req: Request): string {
  switch (adapter) {
    case "STRIPE":
      return typeof parsed.type === "string" ? parsed.type : "unknown";
    case "NOWPAYMENTS":
      return typeof parsed.payment_status === "string" ? `payment.${parsed.payment_status}` : "unknown";
    case "LEMONSQUEEZY": {
      const meta = parsed.meta && typeof parsed.meta === "object" ? (parsed.meta as Record<string, unknown>) : {};
      return typeof meta.event_name === "string" ? meta.event_name : req.headers.get("x-event-name") ?? "unknown";
    }
    default:
      return "unknown";
  }
}
