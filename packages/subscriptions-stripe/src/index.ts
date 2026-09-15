import type Stripe from "stripe";
export {
  normalizeStripePaidSubscriptionInvoice,
  type StripePaidSubscriptionInvoice,
} from "./invoices";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  providerStateSchema,
  type ProviderSubscriptionState,
  type SubscriptionProvider,
} from "@velobase/subscriptions";

const idSchema = z.string().startsWith("sub_").max(256);
const timestamp = (seconds: number | null | undefined) =>
  seconds == null ? null : new Date(seconds * 1000);
export function normalizeStripeSubscription(
  subscription: Stripe.Subscription,
): ProviderSubscriptionState {
  // Clover stores period boundaries on subscription items. Only expose an unambiguous shared period.
  const items = subscription.items.data;
  const start = items[0]?.current_period_start;
  const end = items[0]?.current_period_end;
  const samePeriod =
    !subscription.items.has_more &&
    items.length > 0 &&
    items.every(
      (item) =>
        item.current_period_start === start && item.current_period_end === end,
    );
  return providerStateSchema.parse({
    gatewaySubscriptionId: subscription.id,
    status: subscription.status.toUpperCase(),
    cancelAtPeriodEnd:
      subscription.status !== "canceled" &&
      (subscription.cancel_at_period_end || subscription.cancel_at != null),
    canceledAt: timestamp(subscription.canceled_at),
    endedAt: timestamp(subscription.ended_at),
    ...(samePeriod && start != null && end != null
      ? { periodStart: timestamp(start), periodEnd: timestamp(end) }
      : {}),
  });
}

/** A technical adapter only: credentials, persistence, feature state and entitlement delivery belong to the host. */
export function createStripeSubscriptionProvider(options: {
  getClient(): Stripe | Promise<Stripe>;
}): SubscriptionProvider {
  return {
    async getSubscription(input) {
      const stripe = await options.getClient();
      return normalizeStripeSubscription(
        await stripe.subscriptions.retrieve(idSchema.parse(input)),
      );
    },
    async cancelSubscription(input, atPeriodEnd) {
      const id = idSchema.parse(input);
      const stripe = await options.getClient();
      const current = await stripe.subscriptions.retrieve(id);
      if (current.status === "canceled")
        return normalizeStripeSubscription(current);
      if (
        atPeriodEnd &&
        (current.cancel_at_period_end || current.cancel_at != null)
      )
        return normalizeStripeSubscription(current);
      const result = atPeriodEnd
        ? await stripe.subscriptions.update(
            id,
            { cancel_at_period_end: true },
            { maxNetworkRetries: 0 },
          )
        : await stripe.subscriptions.cancel(
            id,
            { invoice_now: false, prorate: false },
            { maxNetworkRetries: 0 },
          );
      return normalizeStripeSubscription(result);
    },
    async convertTrial(input) {
      const id = idSchema.parse(input);
      const stripe = await options.getClient();
      const current = await stripe.subscriptions.retrieve(id);
      if (current.status !== "trialing")
        throw new Error("Stripe subscription is no longer trialing");
      const trialEnd = z.number().int().positive().parse(current.trial_end);
      const idempotencyKey = `harness:trial:${createHash("sha256").update(`${id}:${trialEnd}`).digest("hex")}`;
      // Provider invoice callbacks settle the paid period; this method never grants an entitlement.
      await stripe.subscriptions.update(
        id,
        { trial_end: "now", proration_behavior: "none" },
        { maxNetworkRetries: 0, idempotencyKey },
      );
    },
  };
}
