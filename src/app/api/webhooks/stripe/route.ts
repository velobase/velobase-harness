import { MODULES } from "@/config/modules";
import { initOrderProviders } from "@/server/order/services/init-providers";
import {
  handlePaymentWebhook,
  handleSubscriptionWebhook,
  WebhookFulfillmentError,
} from "@/server/order/services/handle-webhooks";
import { db } from "@/server/db";
import type Stripe from "stripe";
import { verifyStripeWebhook } from "@/server/order/services/stripe/verify-webhook";

export async function POST(req: Request) {
  if (!MODULES.integrations.payment.stripe.enabled) {
    return new Response(null, { status: 404 });
  }

  // Ensure providers are registered before handling webhooks
  initOrderProviders();

  // Parse and verify Stripe event for logging (and to ensure we only 2xx real Stripe events)
  const rawBody = await req.clone().text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event | null = null;
  let logId: string | null = null;

  if (!signature) {
    // Not a valid Stripe webhook request
    return new Response(
      JSON.stringify({ ok: false, error: "Missing stripe-signature" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  try {
    event = await verifyStripeWebhook(rawBody, signature);

    // Create webhook log entry
    const log = await db.paymentWebhookLog.upsert({
      where: { gateway_eventId: { gateway: "STRIPE", eventId: event.id } },
      create: {
        gateway: "STRIPE",
        eventId: event.id,
        eventType: event.type,
        status: "RECEIVED",
        payload: JSON.parse(JSON.stringify(event)) as object,
      },
      update: {
        // If already exists, just update status to show retry
        status: "RECEIVED",
      },
    });
    logId = log.id;
  } catch (err) {
    // Signature verification failed (or malformed payload). Reject.
    const message =
      err instanceof Error ? err.message : "Invalid Stripe webhook";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Specialized handling for Early Fraud Warnings (EFW)
  // 必须拦截并立即处理，不进入常规 Payment/Subscription 流程
  if (event?.type === "radar.early_fraud_warning.created") {
    try {
      const warning = event.data.object;
      // 动态导入以避免循环依赖或加载过多无用模块
      await import("@/server/risk/services/handle-early-fraud-warning").then(
        (m) => m.handleEarlyFraudWarning(warning),
      );

      if (logId) {
        await db.paymentWebhookLog.update({
          where: { id: logId },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
      }
      return Response.json({ ok: true, message: "EFW processed successfully" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "EFW processing failed";
      // EFW 属于“争议预防”关键链路：建议返回 500 触发 Stripe 重试（已在下游用 idempotency key 做了幂等）
      if (logId) {
        await db.paymentWebhookLog.update({
          where: { id: logId },
          data: { status: "FAILED", error: message, processedAt: new Date() },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  try {
    // Clone the request so we can read the raw body twice (payment + subscription)
    const paymentResult = await handlePaymentWebhook("STRIPE", req.clone());
    const subscriptionResult = await handleSubscriptionWebhook("STRIPE", req);

    // Update log status to processed
    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    }

    return Response.json({
      ok: true,
      payment: paymentResult,
      subscription: subscriptionResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Update log status to failed
    if (logId) {
      await db.paymentWebhookLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: message, processedAt: new Date() },
      });
    }

    // 仅当我们“希望 Stripe 重放”的履约错误才返回非 2xx
    if (err instanceof WebhookFulfillmentError) {
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // 其它错误（解析不兼容/无法映射到 payment 等）都应 2xx 吞掉，避免 Stripe 无限重试
    return Response.json({ ok: false, error: message });
  }
}
