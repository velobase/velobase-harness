import { db } from "@/server/db";
import type { Payment } from "@prisma/client";
import { logger } from "@/server/shared/telemetry/logger";
import { getAdapter } from "../providers/registry";
import { initOrderProviders } from "./init-providers";
import type { WebhookEvent } from "../providers/types";
import { onPaymentSucceeded } from "./webhook-handlers/payment-succeeded";
import { onPaymentFailed } from "./webhook-handlers/payment-failed";
import { onPaymentRefunded } from "./webhook-handlers/payment-refunded";
import { onSubscriptionRenewed } from "./webhook-handlers/subscription-renewed";
import { onSubscriptionUpdated } from "./webhook-handlers/subscription-updated";
import { onSubscriptionCanceled } from "./webhook-handlers/subscription-canceled";
import { onCashflow } from "./webhook-handlers/cashflow";

export class WebhookFulfillmentError extends Error {
  constructor(cause: unknown) {
    super("Webhook fulfillment failed", { cause });
    this.name = "WebhookFulfillmentError";
  }
}

// ---------------------------------------------------------------------------
// Payment lookup — provider-neutral
// ---------------------------------------------------------------------------

async function locatePayment(event: WebhookEvent): Promise<Payment | null> {
  // 1. By metadata (checkout custom data)
  if (event.metadata?.paymentId) {
    const p = await db.payment.findUnique({ where: { id: event.metadata.paymentId } });
    if (p) return p;
  }
  if (event.metadata?.orderId) {
    const p = await db.payment.findFirst({ where: { orderId: event.metadata.orderId }, orderBy: { createdAt: "desc" } });
    if (p) return p;
  }

  // 2. By gateway subscription ID
  if (event.subscriptionId) {
    const p = await db.payment.findFirst({ where: { gatewaySubscriptionId: event.subscriptionId } });
    if (p) return p;
  }

  // 3. By gateway transaction ID
  if (event.transactionId) {
    const p = await db.payment.findFirst({ where: { gatewayTransactionId: event.transactionId } });
    if (p) return p;
  }

  // 4. By checkout ID stored in payment.extra
  if (event.checkoutId) {
    const p = await db.payment.findFirst({
      where: { extra: { path: ["gatewayCheckoutId"], equals: event.checkoutId } },
      orderBy: { createdAt: "desc" },
    });
    if (p) return p;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

async function dispatchEvent(event: WebhookEvent, payment: Payment | null, adapterName: string): Promise<unknown> {
  switch (event.type) {
    case "payment.succeeded":
    case "subscription.activated":
      if (!payment) {
        logger.warn({ adapter: adapterName, eventType: event.type, transactionId: event.transactionId }, "Payment not found for webhook (ignored)");
        return { status: "ignored" };
      }
      return onPaymentSucceeded(event, payment, adapterName);

    case "payment.failed":
      if (!payment) {
        logger.warn({ adapter: adapterName, eventType: event.type }, "Payment not found for failed webhook (ignored)");
        return { status: "ignored" };
      }
      return onPaymentFailed(event, payment, adapterName);

    case "payment.refunded":
      if (!payment) {
        logger.warn({ adapter: adapterName, eventType: event.type }, "Payment not found for refund webhook (ignored)");
        return { status: "ignored" };
      }
      return onPaymentRefunded(event, payment, adapterName);

    case "subscription.renewed":
      return onSubscriptionRenewed(event, adapterName);

    case "subscription.payment_failed":
      if (!payment) {
        logger.warn({ adapter: adapterName, eventType: event.type }, "Payment not found for subscription payment failed (ignored)");
        return { status: "ignored" };
      }
      return onPaymentFailed(event, payment, adapterName);

    case "subscription.updated":
      return onSubscriptionUpdated(event, adapterName);

    case "subscription.canceled":
      return onSubscriptionCanceled(event, adapterName);

    case "cashflow":
      return onCashflow(event, adapterName);

    case "ignored":
    default:
      return { status: "ignored" };
  }
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

export interface WebhookPipelineResult {
  processed: number;
  results: unknown[];
}

export async function processWebhook(adapterName: string, req: Request): Promise<WebhookPipelineResult> {
  initOrderProviders();

  const adapter = getAdapter(adapterName);
  const events = await adapter.parseWebhook(req);

  logger.info({ adapter: adapterName, eventCount: events.length }, "Webhook pipeline: events parsed");

  const results: unknown[] = [];

  for (const event of events) {
    if (event.type === "ignored") continue;

    const payment = await locatePayment(event);

    logger.info({
      adapter: adapterName,
      eventType: event.type,
      paymentId: payment?.id,
      transactionId: event.transactionId,
      subscriptionId: event.subscriptionId,
    }, "Webhook pipeline: dispatching event");

    try {
      const result = await dispatchEvent(event, payment, adapterName);
      results.push(result);
    } catch (err) {
      if (err instanceof WebhookFulfillmentError) throw err;
      logger.error({ err, adapter: adapterName, eventType: event.type }, "Webhook pipeline: handler error (ignored)");
      results.push({ status: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { processed: results.length, results };
}
