import { createStripeOneOffProvider } from "@velobase/payments-stripe";
import { getStripe } from "./client";
import { getStripeWebhookSecret } from "@/server/shared/env";

/** Explicit complete-example composition; constructing this resolves no credentials. */
export const stripeOneOffProvider = createStripeOneOffProvider({
  getClient: getStripe,
  getWebhookSecret: getStripeWebhookSecret,
});
