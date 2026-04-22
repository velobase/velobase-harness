import { MODULES } from "@/config/modules";
import { initOrderProviders } from "@/server/order/services/init-providers";
import { handlePaymentWebhook } from "@/server/order/services/handle-webhooks";
import { db } from "@/server/db";

export async function POST(req: Request) {
  if (!MODULES.integrations.payment.nowpayments.enabled) {
    return new Response(null, { status: 404 });
  }

  initOrderProviders();

  const rawBody = await req.clone().text();

  // Best-effort parse for logging (signature verification happens in provider)
  let eventId: string | null = null;
  let eventType: string | null = null;
  let logId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as {
      payment_id?: string | number;
      payment_status?: string;
      updated_at?: string;
      order_id?: string;
    };
    const pid = parsed?.payment_id != null ? String(parsed.payment_id) : "unknown";
    const st = parsed?.payment_status ?? "unknown";
    const ts = parsed?.updated_at ?? "";
    const oid = parsed?.order_id ?? "";
    eventId = [pid, st, ts || oid || "no_ts"].filter(Boolean).join("_");
    eventType = `payment.${st}`;

    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: "NOWPAYMENTS", eventId } },
      create: {
        gateway: "NOWPAYMENTS",
        eventId,
        eventType,
        status: "RECEIVED",
        payload: (JSON.parse(rawBody) as object) ?? {},
      },
      update: {
        status: "RECEIVED",
      },
    });
    logId = log.id;
  } catch {
    // ignore
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

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}


