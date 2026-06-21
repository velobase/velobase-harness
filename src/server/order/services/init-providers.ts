import { MODULES } from "@/config/modules";
import { registerProvider } from "../providers/registry";
import { stripeProvider } from "../providers/stripe";
import { nowpaymentsProvider } from "../providers/nowpayments";
import { lemonsqueezyProvider } from "../providers/lemonsqueezy";

export function initOrderProviders() {
  if (MODULES.integrations.payment.stripe.enabled) {
    registerProvider("STRIPE", stripeProvider);
  }
  if (MODULES.integrations.payment.lemonsqueezy.enabled) {
    registerProvider("LEMONSQUEEZY", lemonsqueezyProvider);
  }
  if (MODULES.integrations.payment.nowpayments.enabled) {
    registerProvider("NOWPAYMENTS", nowpaymentsProvider);
  }
}
