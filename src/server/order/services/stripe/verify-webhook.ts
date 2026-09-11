import { stripeOneOffProvider } from "./one-off";
import type Stripe from "stripe";

/** Uses the selected adapter and the validated server configuration. */
export async function verifyStripeWebhook(
  body: string,
  signature: string,
): Promise<Stripe.Event> {
  return stripeOneOffProvider.verifyWebhook(body, signature);
}
