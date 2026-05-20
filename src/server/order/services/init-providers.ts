import { registerProvider } from "../providers/registry";
import { stripeProvider } from "../providers/stripe";
import { nowpaymentsProvider } from "../providers/nowpayments";
import { lemonsqueezyProvider } from "../providers/lemonsqueezy";
import { env } from "@/server/shared/env";

export function initOrderProviders() {
  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
    registerProvider("STRIPE", stripeProvider);
  }
  if (env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET) {
    registerProvider("NOWPAYMENTS", nowpaymentsProvider);
  }
  if (env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    registerProvider("LEMONSQUEEZY", lemonsqueezyProvider);
  }
}


