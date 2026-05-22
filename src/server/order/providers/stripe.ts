import type Stripe from "stripe";
import type {
  PaymentAdapter,
  CheckoutRequest,
  CheckoutResponse,
  ConfirmResult,
  WebhookEvent,
  WebhookCashflowData,
} from "./types";
import { getStripeWebhookSecret } from "@/server/shared/env";
import { logger } from "@/server/shared/telemetry/logger";
import {
  stripeCheckoutSessionSchema,
  stripePaymentIntentSchema,
  stripeSubscriptionSchema,
} from "../schemas/webhook";
import { db } from "@/server/db";
import {
  voidAffiliateEarningsForRefund,
  voidAffiliateEarningsForStripeInvoiceRefund,
} from "@/server/affiliate/services/ledger";
import { getStripe } from "@/server/order/services/stripe/client";
import { getOrCreateStripeCustomer } from "@/server/order/services/stripe-customer";

export { getStripe as getStripeClient } from "@/server/order/services/stripe/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const inv = invoice as unknown as Record<string, unknown>;
  const getId = (v: unknown): string | undefined => {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string" && id) return id;
    }
    return undefined;
  };
  const legacy = getId(inv.subscription);
  if (legacy) return legacy;
  const parent = inv.parent as Record<string, unknown> | null | undefined;
  const subDetails = parent?.subscription_details as Record<string, unknown> | null | undefined;
  const parentSub = getId(subDetails?.subscription);
  if (parentSub) return parentSub;
  const lines = inv.lines as Record<string, unknown> | null | undefined;
  const data = lines?.data as unknown[] | null | undefined;
  const line0 = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null;
  const lineSub = getId(line0?.subscription);
  if (lineSub) return lineSub;
  const lineParent = (line0?.parent as Record<string, unknown> | null | undefined) ?? null;
  const itemDetails = lineParent?.subscription_item_details as Record<string, unknown> | null | undefined;
  return getId(itemDetails?.subscription);
}

async function handleStripeRefundOrDispute(params: {
  eventId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  reason: string;
}): Promise<void> {
  const { eventId, paymentIntentId, invoiceId, reason } = params;
  if (paymentIntentId) {
    try {
      const payment = await db.payment.findFirst({
        where: { gatewayTransactionId: paymentIntentId },
        select: { id: true },
      });
      if (payment) {
        await voidAffiliateEarningsForRefund({
          paymentId: payment.id,
          idempotencyKey: `stripe_${reason}:${eventId}:payment:${payment.id}`,
        });
      }
    } catch (error) {
      logger.error({ error, paymentIntentId, reason }, "Failed to void affiliate earning for refund (ignored)");
    }
  }
  if (invoiceId) {
    try {
      await voidAffiliateEarningsForStripeInvoiceRefund({
        invoiceId,
        idempotencyKey: `stripe_${reason}:${eventId}:invoice:${invoiceId}`,
      });
    } catch (error) {
      logger.error({ error, invoiceId, reason }, "Failed to void affiliate earning for invoice refund (ignored)");
    }
  }
}

function buildStripeMetadata(req: CheckoutRequest): Record<string, string> {
  const meta: Record<string, string> = {
    orderId: req.orderId,
    paymentId: req.paymentId,
  };
  if (req.metadata) {
    for (const [k, v] of Object.entries(req.metadata)) {
      meta[k] = v;
    }
  }
  return meta;
}

function inferOccurredAt(obj: unknown): Date {
  if (obj && typeof obj === "object") {
    const r = obj as Record<string, unknown>;
    if (typeof r.created === "number" && Number.isFinite(r.created)) return new Date(r.created * 1000);
  }
  return new Date();
}

function buildCashflow(charge: Record<string, unknown>, eventId: string, eventType: string): WebhookCashflowData | null {
  const amountCents = typeof charge.amount === "number" ? charge.amount : null;
  const currency = typeof charge.currency === "string" ? charge.currency : "usd";
  const chargeId = typeof charge.id === "string" ? charge.id : null;
  if (!chargeId || !amountCents || amountCents <= 0) return null;

  const desc = (typeof charge.description === "string" ? charge.description : "").toLowerCase();
  const kind =
    desc.includes("subscription") && desc.includes("update")
      ? "SUBSCRIPTION_UPDATE_CHARGE"
      : desc.includes("subscription") && desc.includes("creation")
        ? "SUBSCRIPTION_INITIAL_CHARGE"
        : desc.includes("subscription")
          ? "SUBSCRIPTION_OTHER_CHARGE"
          : "ONE_OFF_CHARGE";

  return {
    externalId: chargeId,
    kind,
    amountCents,
    currency,
    occurredAt: inferOccurredAt(charge),
    gatewayChargeId: chargeId,
    gatewayPaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
    gatewayInvoiceId: typeof charge.invoice === "string" ? charge.invoice : null,
    sourceEventId: eventId,
    sourceEventType: eventType,
  };
}

// ---------------------------------------------------------------------------
// Stripe Adapter
// ---------------------------------------------------------------------------

export const stripeAdapter: PaymentAdapter = {
  name: "STRIPE",

  async ensureCustomer(userId: string): Promise<string> {
    return getOrCreateStripeCustomer(userId);
  },

  async confirmPayment(checkoutId: string): Promise<ConfirmResult> {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(checkoutId);
    return {
      paid: session.payment_status === "paid",
      transactionId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
    };
  },

  async expireCheckout(checkoutId: string): Promise<void> {
    const stripe = getStripe();
    await stripe.checkout.sessions.expire(checkoutId);
  },

  async createCheckout(params: CheckoutRequest): Promise<CheckoutResponse> {
    const stripe = getStripe();
    const meta = buildStripeMetadata(params);

    // Read customer ID if ensureCustomer was called before
    const user = await db.user.findUnique({
      where: { id: params.userId },
      select: { stripeCustomerId: true },
    });
    const customerId = (user as { stripeCustomerId?: string | null })?.stripeCustomerId ?? undefined;

    if (params.mode === "subscription") {
      const snapshot = params.productMetadata as {
        hasTrial?: boolean;
        trialDays?: number | null;
      } | null | undefined;

      const hasTrial = !!snapshot?.hasTrial && typeof snapshot.trialDays === "number" && snapshot.trialDays > 0;
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData | undefined =
        hasTrial && typeof snapshot?.trialDays === "number"
          ? { trial_period_days: snapshot.trialDays }
          : undefined;

      const offerEndsAtIso = params.metadata?.offerEndsAt;
      let expiresAt: number | undefined;
      if (offerEndsAtIso && !Number.isNaN(Date.parse(offerEndsAtIso))) {
        const rawExpiry = Math.floor(Date.parse(offerEndsAtIso) / 1000);
        const nowSec = Math.floor(Date.now() / 1000);
        expiresAt = Math.min(Math.max(rawExpiry, nowSec + 30 * 60), nowSec + 24 * 60 * 60);
      }

      const shouldForce3DS = params.amount > 27000;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ...(shouldForce3DS && {
          payment_method_options: { card: { request_three_d_secure: "any" } },
        }),
        line_items: [{
          price_data: {
            currency: params.currency,
            unit_amount: params.amount,
            recurring: { interval: (params.interval ?? "month") as "week" | "month" | "year" },
            product_data: { name: params.productName },
          },
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url: params.metadata?.cancelUrl ?? params.successUrl,
        customer: customerId,
        subscription_data: subscriptionData,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
        metadata: meta,
      });

      return {
        url: session.url!,
        checkoutId: session.id,
        subscriptionId: session.subscription as string,
      };
    }

    // payment mode
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: params.currency,
          unit_amount: params.amount,
          product_data: { name: params.productName },
        },
        quantity: 1,
      }],
      success_url: params.successUrl,
      cancel_url: params.metadata?.cancelUrl ?? params.successUrl,
      customer: customerId,
      payment_intent_data: { metadata: meta },
      metadata: meta,
    });

    return {
      url: session.url!,
      checkoutId: session.id,
      transactionId: session.payment_intent as string | undefined,
    };
  },

  async parseWebhook(req: Request): Promise<WebhookEvent[]> {
    const stripe = getStripe();
    const signature = req.headers.get("stripe-signature");
    if (!signature) return [];

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
    } catch {
      return [];
    }

    logger.info({ type: event.type, id: event.id }, "Stripe webhook received");

    switch (event.type) {
      // ── One-time payment completed ──
      case "checkout.session.completed": {
        const session = stripeCheckoutSessionSchema.parse(event.data.object);
        const isSubscription = !!(session.subscription);
        const metadata: Record<string, string> = {};
        if (session.metadata?.orderId) metadata.orderId = session.metadata.orderId;
        if (session.metadata?.paymentId) metadata.paymentId = session.metadata.paymentId;

        return [{
          type: isSubscription ? "subscription.activated" : "payment.succeeded",
          checkoutId: session.id,
          transactionId: session.payment_intent ?? undefined,
          subscriptionId: session.subscription ?? undefined,
          metadata,
          raw: session,
          providerEventId: event.id,
        }];
      }

      // ── Payment failed ──
      case "payment_intent.payment_failed": {
        const pi = stripePaymentIntentSchema.parse(event.data.object);
        const metadata: Record<string, string> = {};
        if (pi.metadata?.orderId) metadata.orderId = pi.metadata.orderId;
        if (pi.metadata?.paymentId) metadata.paymentId = pi.metadata.paymentId;
        return [{
          type: "payment.failed",
          transactionId: pi.id,
          metadata,
          raw: pi,
          providerEventId: event.id,
        }];
      }

      // ── Cashflow (charge) ──
      case "charge.succeeded": {
        const charge = event.data.object as unknown as Record<string, unknown>;
        if (charge.paid !== true || charge.status !== "succeeded") return [{ type: "ignored", raw: charge }];
        if (typeof charge.invoice === "string" && charge.invoice.length > 0) return [{ type: "ignored", raw: charge }];

        const customerId = typeof charge.customer === "string" ? charge.customer : null;
        let userId: string | null = null;
        if (customerId) {
          const u = await db.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
          userId = u?.id ?? null;
        }
        if (!userId) return [{ type: "ignored", raw: charge }];

        const cf = buildCashflow(charge, event.id, event.type);
        if (!cf) return [{ type: "ignored", raw: charge }];
        cf.userId = userId;

        return [{ type: "cashflow", cashflow: cf, raw: charge, providerEventId: event.id }];
      }

      // ── Refund ──
      case "charge.refunded": {
        const charge = event.data.object as {
          id: string;
          payment_intent?: string | null;
          invoice?: string | null;
          refunded: boolean;
        };
        if (charge.refunded) {
          await handleStripeRefundOrDispute({
            eventId: event.id,
            chargeId: charge.id,
            paymentIntentId: charge.payment_intent ?? null,
            invoiceId: charge.invoice ?? null,
            reason: "refund",
          });
        }
        return [{
          type: "payment.refunded",
          transactionId: charge.payment_intent ?? undefined,
          raw: charge,
          providerEventId: event.id,
        }];
      }

      // ── Dispute ──
      case "charge.dispute.funds_withdrawn": {
        const dispute = event.data.object as {
          id: string;
          charge?: string | null;
          payment_intent?: string | null;
          reason?: string | null;
        };
        await handleStripeRefundOrDispute({
          eventId: event.id,
          chargeId: dispute.charge ?? null,
          paymentIntentId: dispute.payment_intent ?? null,
          invoiceId: null,
          reason: `dispute:${dispute.reason ?? "unknown"}`,
        });
        return [{
          type: "payment.refunded",
          transactionId: dispute.payment_intent ?? undefined,
          raw: dispute,
          providerEventId: event.id,
        }];
      }

      // ── Invoice voided ──
      case "invoice.voided": {
        const invoice = event.data.object as { id: string; subscription?: string | null };
        if (invoice.id) {
          await handleStripeRefundOrDispute({
            eventId: event.id,
            chargeId: null,
            paymentIntentId: null,
            invoiceId: invoice.id,
            reason: "invoice_voided",
          });
        }
        return [{ type: "ignored", raw: invoice }];
      }

      // ── Subscription invoice succeeded ──
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
        const isRenewal = invoice.billing_reason === "subscription_cycle";

        // Stripe early-convert trial: billing_reason=subscription_update + amount_paid>0
        // We check DB to see if current cycle is TRIAL
        const isSubscriptionUpdate =
          invoice.billing_reason === "subscription_update" && (invoice.amount_paid ?? 0) > 0;

        let isTrialConvert = false;
        if (isSubscriptionUpdate && subscriptionId) {
          const sub = await db.userSubscription.findFirst({
            where: { gatewaySubscriptionId: subscriptionId },
            include: { cycles: { where: { status: "ACTIVE" }, orderBy: { sequenceNumber: "desc" }, take: 1 } },
          });
          isTrialConvert = sub?.cycles[0]?.type === "TRIAL";
        }

        if (isRenewal || isTrialConvert) {
          return [{
            type: "subscription.renewed",
            transactionId: invoice.id,
            subscriptionId,
            amount: invoice.amount_paid ?? undefined,
            currency: invoice.currency ?? undefined,
            raw: invoice,
            providerEventId: event.id,
          }];
        }

        // Initial subscription invoice — already handled by checkout.session.completed
        return [{ type: "ignored", raw: invoice }];
      }

      // ── Subscription invoice failed ──
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
        return [{
          type: "subscription.payment_failed",
          transactionId: invoice.id,
          subscriptionId,
          amount: invoice.amount_due ?? undefined,
          currency: invoice.currency ?? undefined,
          raw: invoice,
          providerEventId: event.id,
        }];
      }

      // ── Subscription lifecycle ──
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = stripeSubscriptionSchema.parse(event.data.object);
        const normalizedStatus =
          sub.status === "active" || sub.status === "trialing" ? "SUCCEEDED"
            : sub.status === "canceled" ? "EXPIRED" : "FAILED";

        const cancelAt = typeof sub.cancel_at === "number" ? new Date(sub.cancel_at * 1000) : null;
        const canceledAt = typeof sub.canceled_at === "number" ? new Date(sub.canceled_at * 1000) : null;
        const endedAt = typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000) : null;
        const cancelAtPeriodEnd = sub.cancel_at_period_end === true || cancelAt != null;

        if (normalizedStatus === "EXPIRED") {
          return [{
            type: "subscription.canceled",
            subscriptionId: sub.id,
            subscription: { cancelAtPeriodEnd, cancelAt, canceledAt, endedAt },
            raw: sub,
            providerEventId: event.id,
          }];
        }
        return [{
          type: "subscription.updated",
          subscriptionId: sub.id,
          subscription: { cancelAtPeriodEnd, cancelAt, canceledAt, endedAt },
          raw: sub,
          providerEventId: event.id,
        }];
      }

      case "customer.subscription.deleted": {
        const sub = stripeSubscriptionSchema.parse(event.data.object);
        const cancelAt = typeof sub.cancel_at === "number" ? new Date(sub.cancel_at * 1000) : null;
        const canceledAt = typeof sub.canceled_at === "number" ? new Date(sub.canceled_at * 1000) : null;
        const endedAt = typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000) : null;
        return [{
          type: "subscription.canceled",
          subscriptionId: sub.id,
          subscription: {
            cancelAtPeriodEnd: sub.cancel_at_period_end === true || cancelAt != null,
            cancelAt,
            canceledAt,
            endedAt,
          },
          raw: sub,
          providerEventId: event.id,
        }];
      }

      // ── EFW: handle internally, don't propagate ──
      case "radar.early_fraud_warning.created": {
        try {
          const warning = event.data.object;
          await import("@/server/risk/services/handle-early-fraud-warning").then(m =>
            m.handleEarlyFraudWarning(warning),
          );
        } catch (err) {
          logger.error({ err, eventId: event.id }, "EFW handling failed");
        }
        return [{ type: "ignored", raw: event.data.object, providerEventId: event.id }];
      }

      // ── Ignored ──
      case "payment_intent.succeeded":
      default:
        return [{ type: "ignored", raw: event.data?.object ?? null, providerEventId: event.id }];
    }
  },
};
