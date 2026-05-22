import { registerAdapter } from "../providers/registry";
import { stripeAdapter } from "../providers/stripe";
import { nowpaymentsAdapter } from "../providers/nowpayments";
import { lemonsqueezyAdapter } from "../providers/lemonsqueezy";
import { env } from "@/server/shared/env";

let initialized = false;

export function initOrderProviders() {
  if (initialized) return;
  initialized = true;

  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
    registerAdapter("STRIPE", stripeAdapter);
  }
  if (env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET) {
    registerAdapter("NOWPAYMENTS", nowpaymentsAdapter);
  }
  if (env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    registerAdapter("LEMONSQUEEZY", lemonsqueezyAdapter);
  }
}
