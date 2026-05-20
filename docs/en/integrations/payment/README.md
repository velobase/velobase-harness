# Payment Integration

Payment covers products, orders, subscriptions, credits, payment webhooks, and entitlement delivery.

Supported providers:

- Stripe for card payments and subscriptions.
- NowPayments for optional crypto payments.
- LemonSqueezy for Merchant of Record checkout and subscriptions.

## Architecture

Payment providers are integrated through the order provider layer:

- `src/server/order/providers/types.ts` defines the `PaymentProvider` contract.
- `src/server/order/providers/registry.ts` registers and resolves providers by gateway name.
- `src/server/order/services/init-providers.ts` registers configured providers.
- `src/server/order/services/checkout.ts` owns order/payment creation and calls provider checkout methods.
- `src/server/order/services/handle-webhooks.ts` owns provider-neutral webhook orchestration, payment status updates, subscription renewal handling, and fulfillment dispatch.
- `src/server/fulfillment/**` owns entitlement and credits delivery after successful payment.

Providers should hide platform details behind `PaymentProvider`. Product, order, membership, and fulfillment services should not import provider SDKs directly.

## Provider Contract

Each provider implements:

- `createPayment()` for one-time purchases.
- `createSubscription()` for subscription purchases.
- `handlePaymentWebhook()` for one-time payment or initial checkout events.
- `handleSubscriptionWebhook()` for subscription lifecycle and renewal events.
- Optional `confirmPayment()` for webhook-delay compensation.
- Optional `expireCheckoutSession()` when the provider supports hosted checkout expiration.

Provider results should return normalized IDs:

- `gatewayTransactionId`: provider payment, order, invoice, payment intent, or equivalent cashflow identifier.
- `gatewaySubscriptionId`: provider subscription identifier.
- `gatewayCheckoutId`: hosted checkout/session identifier.
- `providerExtra`: provider-specific metadata to persist under `Payment.extra`.

Do not make generic order or fulfillment code inspect raw provider payloads when a normalized field can be added to the provider result instead.

## Rules

- Get Stripe through `getStripe()` from `@/server/order/services/stripe/client` inside Stripe-specific code only.
- Do not call payment SDKs directly from frontend code.
- Do not hard-code prices; query product data.
- Payment status changes are webhook-driven.
- Frontend confirmation is only compensating polling.
- Entitlement delivery goes through fulfillment and billing services.
- Do not grant credits directly in webhook handlers.
- Keep provider-specific customer, checkout, invoice, and webhook parsing in provider modules.
- Keep new providers selectable through `resolvePaymentGateway()` and the provider registry.

## Configuration

Common environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_PAY_CURRENCY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `LEMONSQUEEZY_TEST_MODE`
- `FORCE_PAYMENT_GATEWAY`

Update `src/env.js`, `.env.example`, and provider registration when adding payment configuration.

`FORCE_PAYMENT_GATEWAY` is for local testing and can force `STRIPE`, `NOWPAYMENTS`, or `LEMONSQUEEZY`.

## Provider Selection

Gateway resolution lives in `src/server/order/services/resolve-gateway.ts`.

Priority order:

1. Explicit checkout input `gateway`.
2. `FORCE_PAYMENT_GATEWAY`.
3. User payment preference when the provider is registered.
4. Default `STRIPE`.

Frontend entry points should pass a gateway only when the user explicitly chooses a method. Otherwise, let the backend resolver choose.

## LemonSqueezy

LemonSqueezy is used as a Merchant of Record provider. It is best suited for simpler global SaaS billing where tax collection and remittance should be handled by the payment provider.

Required setup:

1. Create a LemonSqueezy store.
2. Create products and variants in LemonSqueezy.
3. Add the variant ID to local product metadata. Supported metadata keys include:
   - `lemonsqueezyVariantId`
   - `lemonsqueezy_variant_id`
   - `lemonsqueezy.variantId`
   - `lemonsqueezy.variant_id`
4. Configure `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.
5. Configure LemonSqueezy webhooks to point at `/api/webhooks/lemonsqueezy`.

Recommended webhook events:

- `order_created`
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_recovered`

Checkout creation uses LemonSqueezy `POST /v1/checkouts`. The provider passes local `orderId` and `paymentId` through `checkout_data.custom`; LemonSqueezy returns this data in webhook `meta.custom_data`, which lets the webhook map back to local payment rows.

Webhook verification uses `X-Signature` and HMAC-SHA256 with `LEMONSQUEEZY_WEBHOOK_SECRET`.

## Stripe Versus LemonSqueezy

Use Stripe when the app needs fine-grained usage billing, complex metering, custom payment method control, or advanced subscription lifecycle control.

Use LemonSqueezy when Merchant of Record handling is more important than fine-grained billing control, especially for indie developers and small teams selling globally.

Do not assume Stripe subscription migration to LemonSqueezy is automatic. Existing active subscriptions should either stay with their current gateway or go through an explicit migration/cancel-and-rebuy flow.

## Webhooks And Idempotency

- Verify webhook signatures before processing.
- Store or check provider event IDs where applicable.
- Make entitlement delivery idempotent.
- Worker compensation should retry safely and never double-grant credits.
- Renewal handling should use provider-normalized invoice/payment IDs as idempotency keys.
- If a provider sends multiple events for one business action, only one path should trigger fulfillment.

## Testing

For payment changes, test:

- Checkout creation.
- Webhook signature rejection.
- Successful entitlement delivery.
- Duplicate webhook behavior.
- Refund, renewal, or subscription state transitions when touched.

For provider changes, also test:

- Provider registration with and without required environment variables.
- Gateway resolution via explicit input, `FORCE_PAYMENT_GATEWAY`, and user preference.
- Webhook signature rejection for invalid signatures.
- One-time purchase webhook mapping to `Payment` and `Order`.
- Subscription initial purchase, renewal, cancellation, expiration, and failed payment behavior.
- Local PostgreSQL and Redis flows using an isolated Docker Compose project and `down -v` cleanup when running integration smoke tests.
