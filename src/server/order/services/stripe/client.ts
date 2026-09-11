/**
 * Stripe Client — Single Source of Truth
 *
 * ALL server-side code that needs a Stripe instance MUST import from here:
 *
 *   import { getStripe } from "@/server/order/services/stripe/client";
 *
 * - Lazy singleton: the Stripe instance is created on first call, not at
 *   module load time. Missing STRIPE_SECRET_KEY won't crash the process —
 *   only the code path that actually calls getStripe() will throw.
 * - apiVersion is defined once (STRIPE_API_VERSION).
 * - Secret key is resolved through the validated env helper, not raw
 *   process.env, so Zod validation is always respected.
 */
import type Stripe from "stripe";
import { createStripeClient } from "@velobase/payments-stripe";
import { getStripeSecretKey } from "@/server/shared/env";

export { STRIPE_API_VERSION } from "@velobase/payments-stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = getStripeSecretKey();
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured. " +
          "Set it in your environment or .env file before calling Stripe APIs.",
      );
    }
    _stripe = createStripeClient(key);
  }
  return _stripe;
}
