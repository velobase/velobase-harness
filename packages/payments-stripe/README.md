# Stripe payment adapter

`@velobase/payments-stripe` is an explicitly selected server-side technical adapter.

It depends on `@velobase/payments`, Stripe 19.1.0 and Zod.

It imports no Prisma, auth, subscription business service, credits, AI, queue or notification module.

It reads no environment variables and makes no request when the provider is constructed.

## Select and configure

Add `@velobase/payments` and `@velobase/payments-stripe` as `workspace:*` dependencies of the host.

Transpile these source packages in a Next.js host.

Import this adapter only in server composition; the business package does not import or discover it automatically.

```ts
import { createPaymentProviderRegistry } from "@velobase/payments/providers";
import { createStripeClient, createStripeOneOffProvider } from "@velobase/payments-stripe";

// These functions belong to the host's validated server configuration.
// They may read encrypted Admin connection settings instead of environment config.
declare function readStripeSecretKey(): Promise<string>;
declare function readStripeWebhookSecret(): Promise<string>;

const stripe = createStripeOneOffProvider({
  getClient: async () => createStripeClient(await readStripeSecretKey()),
  getWebhookSecret: readStripeWebhookSecret,
});
const providers = createPaymentProviderRegistry();
providers.register("STRIPE", stripe);
```

The complete example selects this adapter in `src/server/order/services/stripe/one-off.ts` and retains the shared lazy `getStripe()` singleton.

Its Admin payment connection and environment adapter remain the source of configuration.

An Admin switch does not install this package or change its API version.

## One-off checkout

`createPayment` takes the persisted payment identity and a trusted order quote in the currency's smallest unit.

The amount is the **order total**; the Stripe line item uses quantity one.

Supply explicit absolute HTTP(S) `SuccessURL` and `CancelURL` in `payment.extra`; the host owns allowed return destinations.

An optional `stripeCustomerId` must come from the authenticated user's server-side customer mapping.

The adapter copies primitive metadata and reserves `orderId` and `paymentId`.

It creates a hosted Checkout Session with the same association on the PaymentIntent, disabling adaptive pricing so the persisted quote owns amount/currency.

The idempotency key is a stable hash of the payment ID.

Each create call makes one HTTP attempt (`maxNetworkRetries: 0`); host persistence owns retry decisions.

Explicit parameter/auth/permission rejection throws `StripeCheckoutRejectedError`, which proves only this attempt was rejected, not that a prior uncertain attempt did nothing.

Persist the returned session ID, URL and discovered transaction ID on that payment before returning the redirect to the browser.

Retries must use that same payment ID **and the same request parameters**.

A timeout does not prove that Stripe created nothing.

Do not rotate the identity, retry after the provider's idempotency retention window, or create a replacement merely because a local record expired.

The host owns a durable attempt/request snapshot and reconciliation of uncertain outcomes.

This technical adapter does not provide that persistence.

Captured intents with a fully refunded latest charge are reported as refunded.

Session confirmation retains read-only subscription ID compatibility for the complete example; this package does not create subscriptions or process their lifecycle.

For a one-off payment, use `assertStripePaymentMatch(evidence, expected)` against the persisted payment/order, amount, currency and any known session/transaction IDs **before** calling `recordVerifiedState` or fulfillment.

Derive those expected values from the authorized server record, never the browser.

`queryPaymentStatus` is a status-only convenience and does not replace that association check.

`handlePaymentWebhook` verifies the signature against the raw request body.

Invalid/missing signatures throw.

`verifyWebhook` also exposes the verified Stripe event for a host that needs an event log or additional financial processing.

Call `normalizeStripeOneOffEvent` only on an already verified event.

Retain the event ID in the host's durable processing record; retry persistence or fulfillment failures with a non-success response.

| Verified event | One-off result |
| --- | --- |
| Checkout completed, paid (or completed with no payment required) | Succeeded |
| Checkout completed, payment still pending | Pending |
| Async payment succeeded / failed | Paid status / failed |
| Checkout expired | Expired |
| Charge fully refunded | Refunded |
| Partial refund, PaymentIntent success, charge success, subscription events | No one-off status change |

The host associates normalized evidence with its own stored attempt and validates amount/currency before applying it.

Fulfillment, partial-refund accounting, disputes, subscriptions and reversals remain explicit host policies.

The adapter does not deliver entitlements or send messages.

`expireCheckoutSession` treats an already expired remote session as closed, expires an open one, and rejects a completed one.

A race with payment completion must be reconciled by the host.

Only mark local cancellation after remote closure is known.

Turning off **new payments** must retain this adapter and the verified webhook/confirmation/settlement routes for accepted work.

Removing its code is a deployment decision after pending sessions and financial obligations are resolved.

No tests, builds, application execution or Stripe requests were run for this extraction.
