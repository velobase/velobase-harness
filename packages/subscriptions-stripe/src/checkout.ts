import { createHash } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import {
  recurringCheckoutSchema,
  type RecurringCheckout,
  type RecurringCheckoutEvidence,
  type RecurringCheckoutProvider,
} from "@velobase/subscriptions/checkout";

const checkoutIdSchema = z.string().startsWith("cs_").max(256);
const subscriptionIdSchema = z.string().startsWith("sub_").max(256);
const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
export class StripeRecurringCheckoutRejectedError extends Error {
  constructor(cause: unknown) {
    super("Stripe rejected the recurring checkout request", { cause });
  }
}
function normalizeRequest(input: unknown) {
  const data = recurringCheckoutSchema.parse(input);
  const keys = Object.keys(data.metadata).sort();
  if (
    keys.length > 48 ||
    keys.some(
      (key) =>
        !key ||
        key.length > 40 ||
        /[\[\]]/.test(key) ||
        key === "harnessCheckoutId" ||
        key === "harnessRequestDigest",
    )
  )
    throw new Error(
      "Recurring checkout metadata uses an invalid or reserved key",
    );
  if (data.customerId) z.string().startsWith("cus_").parse(data.customerId);
  return {
    ...data,
    metadata: Object.fromEntries(keys.map((key) => [key, data.metadata[key]!])),
  };
}
export const recurringRequestDigest = (input: RecurringCheckout) =>
  createHash("sha256")
    .update(JSON.stringify(normalizeRequest(input)))
    .digest("hex");
function evidence(session: Stripe.Checkout.Session): RecurringCheckoutEvidence {
  if (session.mode !== "subscription")
    throw new Error("Checkout is not a subscription");
  const lines = session.line_items;
  const item = lines?.data[0];
  const price = item?.price;
  return {
    checkoutId: session.id,
    requestId: session.metadata?.harnessCheckoutId,
    requestDigest: session.metadata?.harnessRequestDigest,
    status: session.status,
    paymentStatus: session.payment_status,
    url: session.url ?? undefined,
    customerId: reference(session.customer),
    subscriptionId: reference(session.subscription),
    quote:
      lines &&
      !lines.has_more &&
      lines.data.length === 1 &&
      price?.recurring &&
      price.unit_amount != null &&
      item?.quantity != null
        ? {
            amount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring.interval,
            intervalCount: price.recurring.interval_count,
            quantity: item.quantity,
          }
        : null,
  };
}
export function assertRecurringCheckoutMatch(
  actual: RecurringCheckoutEvidence,
  input: RecurringCheckout,
) {
  const expected = normalizeRequest(input);
  const quote = actual.quote;
  if (
    actual.requestId !== expected.requestId ||
    actual.requestDigest !== recurringRequestDigest(expected) ||
    !quote ||
    quote.quantity !== 1 ||
    quote.amount !== expected.amount ||
    quote.currency !== expected.currency ||
    quote.interval !== expected.interval ||
    quote.intervalCount !== expected.intervalCount ||
    (expected.customerId && actual.customerId !== expected.customerId)
  )
    throw new Error("Recurring checkout does not match the accepted request");
}
/** Credentials and admitted request records belong to the host. No imports from a Web app or database. */
export function createStripeRecurringCheckout(options: {
  getClient(): Stripe | Promise<Stripe>;
}): RecurringCheckoutProvider {
  async function inspect(input: string) {
    const stripe = await options.getClient();
    return evidence(
      await stripe.checkout.sessions.retrieve(
        checkoutIdSchema.parse(input),
        { expand: ["line_items"] },
        { maxNetworkRetries: 0 },
      ),
    );
  }
  return {
    async create(input) {
      const data = normalizeRequest(input);
      const stripe = await options.getClient();
      const metadata = {
        ...data.metadata,
        harnessCheckoutId: data.requestId,
        harnessRequestDigest: recurringRequestDigest(data),
      };
      const idempotencyKey = `harness:recurring:${createHash("sha256").update(data.requestId).digest("hex")}`;
      const session = await stripe.checkout.sessions
        .create(
          {
            mode: "subscription",
            adaptive_pricing: { enabled: false },
            line_items: [
              {
                price_data: {
                  currency: data.currency,
                  unit_amount: data.amount,
                  recurring: {
                    interval: data.interval,
                    interval_count: data.intervalCount,
                  },
                  product_data: { name: data.name },
                },
                quantity: 1,
              },
            ],
            success_url: data.successUrl,
            cancel_url: data.cancelUrl,
            customer: data.customerId,
            subscription_data: {
              metadata,
              ...(data.trialDays ? { trial_period_days: data.trialDays } : {}),
            },
            ...(data.expiresAt ? { expires_at: data.expiresAt } : {}),
            ...(data.requireThreeDSecure
              ? {
                  payment_method_options: {
                    card: { request_three_d_secure: "any" },
                  },
                }
              : {}),
            metadata,
            expand: ["line_items"],
          },
          { idempotencyKey, maxNetworkRetries: 0 },
        )
        .catch((error: unknown) => {
          if (
            error instanceof Stripe.errors.StripeInvalidRequestError ||
            error instanceof Stripe.errors.StripeAuthenticationError ||
            error instanceof Stripe.errors.StripePermissionError
          )
            throw new StripeRecurringCheckoutRejectedError(error);
          throw error;
        });
      const result = evidence(session);
      assertRecurringCheckoutMatch(result, data);
      return result;
    },
    inspect,
    async expire(input) {
      const current = await inspect(input);
      if (current.status !== "open") return current;
      const stripe = await options.getClient();
      await stripe.checkout.sessions.expire(
        checkoutIdSchema.parse(input),
        {},
        { maxNetworkRetries: 0 },
      );
      return inspect(input);
    },
  };
}

/** The host authorizes ownership before requesting this cancellation-only portal flow. */
export async function createStripeCancellationPortal(
  options: { getClient(): Stripe | Promise<Stripe> },
  input: { subscriptionId: string; returnUrl: string },
) {
  const subscriptionId = subscriptionIdSchema.parse(input.subscriptionId);
  const returnUrl = z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    })
    .parse(input.returnUrl);
  const stripe = await options.getClient();
  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId,
    {},
    { maxNetworkRetries: 0 },
  );
  const customerId = reference(subscription.customer);
  if (!customerId || subscription.status === "canceled")
    throw new Error("Subscription cannot open a cancellation flow");
  const configurations = await stripe.billingPortal.configurations.list(
    { active: true, is_default: true, limit: 1 },
    { maxNetworkRetries: 0 },
  );
  const configuration = configurations.data[0];
  if (
    !configuration?.features.subscription_cancel.enabled ||
    configuration.features.subscription_cancel.mode !== "at_period_end"
  )
    throw new Error(
      "Configure the Stripe cancellation portal to stop renewal at period end",
    );
  const session = await stripe.billingPortal.sessions.create(
    {
      configuration: configuration.id,
      customer: customerId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: { subscription: subscriptionId },
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    },
    { maxNetworkRetries: 0 },
  );
  return z.string().url().parse(session.url);
}
