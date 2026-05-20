import { initOrderProviders } from "@/server/order/services/init-providers";
import {
  handlePaymentWebhook,
  handleSubscriptionWebhook,
  WebhookFulfillmentError,
} from "@/server/order/services/handle-webhooks";
import { db } from "@/server/db";

export async function POST(req: Request) {
  initOrderProviders();

  const rawBody = await req.clone().text();
  const signature = req.headers.get("x-signature");
  if (!signature) {
    return new Response(JSON.stringify({ ok: false, error: "Missing x-signature" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let logId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as {
      meta?: { event_name?: string };
      data?: { id?: string; type?: string; attributes?: { updated_at?: string; created_at?: string } };
    };
    const eventType = parsed.meta?.event_name ?? req.headers.get("x-event-name") ?? "unknown";
    const dataId = parsed.data?.id ?? "unknown";
    const timestamp = parsed.data?.attributes?.updated_at ?? parsed.data?.attributes?.created_at ?? "";
    const eventId = [eventType, dataId, timestamp].filter(Boolean).join("_");

    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: "LEMONSQUEEZY", eventId } },
      create: {
        gateway: "LEMONSQUEEZY",
        eventId,
        eventType,
        status: "RECEIVED",
        payload: parsed as object,
      },
      update: {
        status: "RECEIVED",
      },
    });
    logId = log.id;
  } catch {
    // Signature verification happens inside the provider; malformed JSON is handled there.
  }

  try {
    const paymentResult = await handlePaymentWebhook("LEMONSQUEEZY", req.clone());
    const subscriptionResult = await handleSubscriptionWebhook("LEMONSQUEEZY", req);

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    }

    return Response.json({ ok: true, payment: paymentResult, subscription: subscriptionResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: message, processedAt: new Date() },
      });
    }

    if (err instanceof WebhookFulfillmentError) {
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return Response.json({ ok: false, error: message });
  }
}
