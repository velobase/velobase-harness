import type Stripe from "stripe";
import { z } from "zod";
import { normalizeStripeSubscription } from "./index";
import { normalizeStripePaidSubscriptionInvoice } from "./invoices";
const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

/** Selected read-only billing adapter. Raw webhook order is not used as the current subscription state. */
export function createStripeSubscriptionBilling(options: {
  getClient(): Stripe | Promise<Stripe>;
}) {
  return {
    async subscription(input: string) {
      const stripe = await options.getClient();
      const subscription = await stripe.subscriptions.retrieve(
        z.string().startsWith("sub_").max(256).parse(input),
        {},
        { maxNetworkRetries: 0 },
      );
      return {
        state: normalizeStripeSubscription(subscription),
        metadata: subscription.metadata,
        customerId: reference(subscription.customer),
        latestInvoiceId: reference(subscription.latest_invoice),
      };
    },
    async checkoutForSubscription(input: string, requestId: string) {
      const stripe = await options.getClient();
      const sessions = await stripe.checkout.sessions.list(
        {
          subscription: z.string().startsWith("sub_").max(256).parse(input),
          limit: 2,
        },
        { maxNetworkRetries: 0 },
      );
      if (sessions.has_more)
        throw new Error("Subscription has ambiguous checkout sessions");
      const matches = sessions.data.filter(
        (session) =>
          session.mode === "subscription" &&
          session.metadata?.harnessCheckoutId === requestId,
      );
      if (matches.length !== 1)
        throw new Error("Accepted subscription checkout is not available yet");
      return matches[0]!.id;
    },
    async paidInvoice(input: string) {
      const stripe = await options.getClient();
      const invoice = await stripe.invoices.retrieve(
        z.string().startsWith("in_").max(256).parse(input),
        {},
        { maxNetworkRetries: 0 },
      );
      if (invoice.status !== "paid") return null;
      const evidence = normalizeStripePaidSubscriptionInvoice(invoice);
      const line = invoice.lines.data[0];
      const priceId = line?.pricing?.price_details?.price;
      if (
        invoice.lines.has_more ||
        invoice.lines.data.length !== 1 ||
        !line ||
        line.quantity !== 1 ||
        line.parent?.subscription_item_details?.proration ||
        !priceId
      )
        throw new Error(
          "This composition requires a single non-prorated recurring invoice line",
        );
      const price = await stripe.prices.retrieve(
        priceId,
        {},
        { maxNetworkRetries: 0 },
      );
      if (!price.recurring || price.unit_amount == null)
        throw new Error("Invoice does not contain an integral recurring price");
      return {
        ...evidence,
        lineAmount: line.amount,
        unitAmount: price.unit_amount,
        priceCurrency: price.currency,
        interval: price.recurring.interval,
        intervalCount: price.recurring.interval_count,
      };
    },
  };
}
