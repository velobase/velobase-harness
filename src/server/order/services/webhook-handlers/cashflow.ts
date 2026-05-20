import { logger } from "@/server/shared/telemetry/logger";
import { recordPaymentTransaction } from "../payment-transactions";
import type { WebhookEvent } from "../../providers/types";

export async function onCashflow(event: WebhookEvent, adapterName: string) {
  if (!event.cashflow) {
    logger.warn({ adapter: adapterName }, "Cashflow event missing cashflow data");
    return { status: "ignored" };
  }

  const cf = event.cashflow;

  try {
    await recordPaymentTransaction({
      userId: cf.userId ?? null,
      gateway: adapterName.toUpperCase(),
      externalId: cf.externalId,
      kind: cf.kind as "ONE_OFF_CHARGE" | "SUBSCRIPTION_INITIAL_CHARGE" | "SUBSCRIPTION_RENEWAL_CHARGE" | "SUBSCRIPTION_UPDATE_CHARGE" | "SUBSCRIPTION_OTHER_CHARGE",
      amountCents: cf.amountCents,
      currency: cf.currency,
      occurredAt: cf.occurredAt,
      orderId: null,
      paymentId: null,
      gatewayInvoiceId: cf.gatewayInvoiceId ?? null,
      gatewayChargeId: cf.gatewayChargeId ?? null,
      gatewayPaymentIntentId: cf.gatewayPaymentIntentId ?? null,
      gatewaySubscriptionId: cf.gatewaySubscriptionId ?? null,
      sourceEventId: cf.sourceEventId ?? null,
      sourceEventType: cf.sourceEventType ?? null,
    });
  } catch (err) {
    logger.warn({ err, adapter: adapterName, externalId: cf.externalId }, "Failed to record cashflow (ignored)");
  }

  return { status: "recorded" };
}
