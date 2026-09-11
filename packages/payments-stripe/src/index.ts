import { createHash } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import {
  BaseWebhookResult,
  type OneOffPaymentProvider,
  type PaymentStatus,
  type PaymentWebhookResult,
  type ProviderOrder,
  type ProviderPayment,
} from "@velobase/payments/providers";

export const STRIPE_API_VERSION = "2025-09-30.clover" as const;

/** This single create request was rejected before session creation. Earlier uncertain attempts remain uncertain. */
export class StripeCheckoutRejectedError extends Error {
  constructor(cause: unknown) {
    super("Stripe rejected the checkout request", { cause });
    this.name = "StripeCheckoutRejectedError";
  }
}

/** Server-only technical client. No environment reads or requests at construction. */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(z.string().trim().min(1).parse(secretKey), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}

const idSchema = z.string().trim().min(1).max(256);
const amountSchema = z.number().int().min(0).max(2_147_483_647);
const currencySchema = z
  .string()
  .regex(/^[a-zA-Z]{3}$/)
  .transform((v) => v.toLowerCase());
const returnUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "An absolute HTTP(S) return URL is required");

function resourceId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

/** Custom metadata cannot overwrite the host's payment/order association. */
export function stripePaymentMetadata(
  orderId: string,
  paymentId: string,
  extra: unknown,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [key, value] of Object.entries(extra)) {
      if (
        key === "orderId" ||
        key === "paymentId" ||
        !key ||
        key.length > 40 ||
        /[\[\]]/.test(key)
      )
        continue;
      if (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      ) {
        // Stripe accepts at most 50 keys (including the two reserved IDs).
        if (Object.keys(metadata).length >= 48) break;
        metadata[key] = String(value).slice(0, 500);
      }
    }
  }
  return {
    ...metadata,
    orderId: idSchema.parse(orderId),
    paymentId: idSchema.parse(paymentId),
  };
}

function intentStatus(intent: Stripe.PaymentIntent): PaymentStatus {
  const charge = intent.latest_charge;
  if (charge && typeof charge !== "string" && charge.refunded)
    return "REFUNDED";
  switch (intent.status) {
    case "succeeded":
      return "SUCCEEDED";
    case "canceled":
      return "EXPIRED";
    case "requires_action":
      return "REQUIRES_ACTION";
    case "requires_payment_method":
      // A declined card can be retried in the same Checkout Session.
      return "PENDING";
    default:
      return "PENDING";
  }
}

export interface StripePaymentEvidence {
  isPaid: boolean;
  status: PaymentStatus;
  checkoutSessionId?: string;
  paymentUrl?: string;
  sessionStatus?: "open" | "complete" | "expired" | null;
  gatewayTransactionId?: string;
  gatewaySubscriptionId?: string;
  paymentId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
}

/** Call only with a Stripe event returned by signature verification. No business side effects. */
export function normalizeStripeOneOffEvent(
  event: Stripe.Event,
): PaymentWebhookResult | null {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.mode !== "payment") return null;
      const paid =
        session.payment_status === "paid" ||
        (session.payment_status === "no_payment_required" &&
          session.status === "complete");
      const status: PaymentStatus = paid
        ? "SUCCEEDED"
        : event.type === "checkout.session.expired"
          ? "EXPIRED"
          : event.type === "checkout.session.async_payment_failed"
            ? "FAILED"
            : "PENDING";
      return new BaseWebhookResult({
        status,
        gatewayTransactionId: resourceId(session.payment_intent),
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        rawData: session,
      });
    }
    case "charge.refunded": {
      const charge = event.data.object;
      // A partial refund is cashflow evidence, not a fully refunded payment.
      if (!charge.refunded || !charge.payment_intent) return null;
      return new BaseWebhookResult({
        status: "REFUNDED",
        gatewayTransactionId: resourceId(charge.payment_intent),
        amount: charge.amount,
        currency: charge.currency,
        rawData: charge,
      });
    }
    default:
      // Checkout success owns fulfillment. PaymentIntent and charge success events
      // may arrive first or concurrently; do not create a second success channel.
      return null;
  }
}

/** A host must compare authenticated provider evidence with its persisted attempt. */
export function assertStripePaymentMatch(
  evidence: StripePaymentEvidence,
  expected: {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
    checkoutSessionId?: string;
    gatewayTransactionId?: string;
  },
): void {
  if (
    evidence.paymentId !== expected.paymentId ||
    evidence.orderId !== expected.orderId ||
    evidence.amount !== expected.amount ||
    evidence.currency?.toLowerCase() !== expected.currency.toLowerCase() ||
    (expected.checkoutSessionId &&
      evidence.checkoutSessionId !== expected.checkoutSessionId) ||
    (expected.gatewayTransactionId &&
      evidence.gatewayTransactionId !== expected.gatewayTransactionId)
  )
    throw new Error(
      "Stripe payment evidence does not match the stored payment",
    );
}

/** This factory does not resolve credentials, open a connection, or import business modules. */
export function createStripeOneOffProvider(options: {
  getClient(): Stripe | Promise<Stripe>;
  getWebhookSecret(): string | Promise<string>;
}) {
  async function verifyWebhook(
    body: string,
    signature: string,
  ): Promise<Stripe.Event> {
    const secret = z
      .string()
      .min(1)
      .parse(await options.getWebhookSecret());
    const stripe = await options.getClient();
    return stripe.webhooks.constructEventAsync(
      body,
      z.string().min(1).parse(signature),
      secret,
    );
  }

  async function confirmPayment(params: {
    checkoutSessionId?: string;
    gatewayTransactionId?: string;
  }): Promise<StripePaymentEvidence> {
    if (!params.checkoutSessionId && !params.gatewayTransactionId) {
      return { isPaid: false, status: "PENDING" };
    }
    const stripe = await options.getClient();
    if (params.checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        idSchema.parse(params.checkoutSessionId),
      );
      const paid =
        session.payment_status === "paid" ||
        (session.mode === "payment" &&
          session.payment_status === "no_payment_required" &&
          session.status === "complete");
      const intentId = resourceId(session.payment_intent);
      let status: PaymentStatus = paid
        ? "SUCCEEDED"
        : session.status === "expired"
          ? "EXPIRED"
          : "PENDING";
      if (paid && intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId, {
          expand: ["latest_charge"],
        });
        status = intentStatus(intent);
      }
      return {
        isPaid: status === "SUCCEEDED",
        status,
        checkoutSessionId: session.id,
        paymentUrl: session.url ?? undefined,
        sessionStatus: session.status,
        gatewayTransactionId: intentId,
        // Read-only compatibility for hosts that also compose subscriptions.
        gatewaySubscriptionId: resourceId(session.subscription),
        paymentId: session.metadata?.paymentId,
        orderId: session.metadata?.orderId,
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
      };
    }
    const intent = await stripe.paymentIntents.retrieve(
      idSchema.parse(params.gatewayTransactionId),
      { expand: ["latest_charge"] },
    );
    const status = intentStatus(intent);
    return {
      isPaid: status === "SUCCEEDED",
      status,
      gatewayTransactionId: intent.id,
      paymentId: intent.metadata.paymentId,
      orderId: intent.metadata.orderId,
      amount: intent.amount,
      currency: intent.currency,
    };
  }

  const provider = {
    async createPayment({
      payment,
      order,
    }: {
      payment: ProviderPayment;
      order: ProviderOrder;
    }) {
      const orderId = idSchema.parse(order.id);
      const paymentId = idSchema.parse(payment.id);
      const amount = amountSchema.parse(order.amount);
      const currency = currencySchema.parse(order.currency);
      const successUrl = returnUrlSchema.parse(payment.extra?.SuccessURL);
      const cancelUrl = returnUrlSchema.parse(payment.extra?.CancelURL);
      const name = z
        .string()
        .trim()
        .min(1)
        .max(500)
        .parse(order.productSnapshot?.name ?? "Product");
      const customer =
        payment.extra?.stripeCustomerId == null
          ? undefined
          : idSchema.parse(payment.extra.stripeCustomerId);
      const metadata = stripePaymentMetadata(
        orderId,
        paymentId,
        payment.extra?.metadata,
      );
      // A retry of this stored payment uses the same key and the same parameters.
      // Never rotate it after a timeout. A changed request must resolve the old attempt first.
      const idempotencyKey = `harness:payment:${createHash("sha256").update(paymentId).digest("hex")}`;
      const stripe = await options.getClient();
      const session = await stripe.checkout.sessions
        .create(
          {
            mode: "payment",
            // The host's persisted quote owns currency and amount.
            adaptive_pricing: { enabled: false },
            line_items: [
              {
                price_data: {
                  currency,
                  unit_amount: amount,
                  product_data: { name },
                },
                quantity: 1,
              },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            customer,
            payment_intent_data: { metadata },
            metadata,
          },
          { idempotencyKey, maxNetworkRetries: 0 },
        )
        .catch((error: unknown) => {
          if (
            error instanceof Stripe.errors.StripeInvalidRequestError ||
            error instanceof Stripe.errors.StripeAuthenticationError ||
            error instanceof Stripe.errors.StripePermissionError
          )
            throw new StripeCheckoutRejectedError(error);
          throw error;
        });
      if (!session.url)
        throw new Error(
          `Stripe checkout ${session.id} has no active payment URL`,
        );
      return {
        paymentUrl: session.url,
        checkoutSessionId: session.id,
        gatewayTransactionId: resourceId(session.payment_intent),
      };
    },
    confirmPayment,
    async queryPaymentStatus(
      gatewayTransactionId: string,
    ): Promise<PaymentStatus> {
      return (await confirmPayment({ gatewayTransactionId })).status;
    },
    async expireCheckoutSession(checkoutSessionId: string): Promise<void> {
      const stripe = await options.getClient();
      const id = idSchema.parse(checkoutSessionId);
      const session = await stripe.checkout.sessions.retrieve(id);
      if (session.status === "expired") return;
      if (session.status !== "open")
        throw new Error("A completed Stripe checkout cannot be expired");
      // A concurrent completion makes this fail; the host must reconcile it, not cancel locally.
      await stripe.checkout.sessions.expire(id);
    },
    async handlePaymentWebhook(
      req: Request,
    ): Promise<PaymentWebhookResult | null> {
      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new Error("Missing stripe-signature");
      return normalizeStripeOneOffEvent(
        await verifyWebhook(await req.text(), signature),
      );
    },
  } satisfies OneOffPaymentProvider;

  return { ...provider, verifyWebhook };
}
