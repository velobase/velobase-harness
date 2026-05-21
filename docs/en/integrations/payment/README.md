# Payment Integration

Payment covers products, orders, subscriptions, credits, payment webhooks, and entitlement delivery.

Supported providers:

- Stripe for card payments and subscriptions.
- NowPayments for optional crypto payments.
- LemonSqueezy for Merchant of Record checkout and subscriptions.

## Architecture

Payment providers are integrated through the order provider layer:

- `src/server/order/providers/types.ts` defines the `PaymentAdapter` contract, `CheckoutRequest/Response`, and `WebhookEvent` types.
- `src/server/order/providers/registry.ts` registers and resolves adapters by gateway name.
- `src/server/order/services/init-providers.ts` registers configured adapters based on environment variables.
- `src/server/order/services/checkout.ts` owns order/payment creation and calls adapter checkout methods.
- `src/server/order/services/webhook-pipeline.ts` parses webhooks via adapters, normalizes into `WebhookEvent`, and dispatches to single-responsibility event handlers.
- `src/server/order/services/webhook-handlers/` contains individual handlers: `payment-succeeded`, `payment-failed`, `payment-refunded`, `subscription-renewed`, `subscription-updated`, `subscription-canceled`, `cashflow`.
- `src/server/order/services/webhook-route-handler.ts` provides a generic route handler for all webhook endpoints.
- `src/server/fulfillment/**` owns entitlement and credits delivery after successful payment.

Adapters should hide platform details behind `PaymentAdapter`. Product, order, membership, and fulfillment services should not import provider SDKs directly.

## Adapter Contract

Each adapter implements `PaymentAdapter`:

- `createCheckout(params)` for both one-time and subscription purchases (determined by `params.mode`).
- `parseWebhook(req)` to verify signatures and normalize raw provider events into `WebhookEvent[]`.
- Optional `confirmPayment(checkoutId)` for webhook-delay compensation polling.
- Optional `expireCheckout(checkoutId)` when the provider supports hosted checkout expiration.
- Optional `ensureCustomer(userId, email?)` for providers that require a customer object (e.g. Stripe).

`parseWebhook` returns an array of `WebhookEvent` with a standardized `type` field:

- `payment.succeeded`, `payment.failed`, `payment.refunded`
- `subscription.activated`, `subscription.renewed`, `subscription.payment_failed`
- `subscription.updated`, `subscription.canceled`
- `cashflow`, `ignored`

Each adapter maps provider-specific events into these normalized types. The webhook pipeline and event handlers are completely provider-neutral.

## Pricing

All prices and subscription intervals are stored in the database, not hard-coded in payment code.

- `Product.price` (cents), `Product.originalPrice`, `Product.interval` (week/month/year).
- `ProductPrice` for multi-currency pricing (USD/EUR/GBP/CHF/AUD), resolved by user country.
- `SubscriptionPlan.interval`, `intervalCount`, `creditsPerPeriod` for subscription billing cycles and credit grants.
- `ProductCreditsPackage.creditsAmount` for one-time credit packages.

Checkout reads pricing from the database and passes it to the adapter. Stripe uses dynamic `price_data` (no pre-created Stripe products needed). Changing a price in the database takes effect on the next checkout.

Product configuration is managed through `prisma/seed-products.ts` (source of truth for initial setup) and the Admin API (`updateProduct` for price, status, trial settings).

## Rules

- Get Stripe through `getStripe()` from `@/server/order/services/stripe/client` inside Stripe-specific code only.
- Do not call payment SDKs directly from frontend code.
- Do not hard-code prices; query product data.
- Payment status changes are webhook-driven.
- Frontend confirmation is only compensating polling.
- Entitlement delivery goes through fulfillment and billing services.
- Do not grant credits directly in webhook handlers.
- Keep provider-specific customer, checkout, invoice, and webhook parsing in adapter modules.
- Keep new adapters selectable through `resolvePaymentGateway()` and the adapter registry.

## Third-Party Component Configuration

Payment providers are optional third-party components. You do not need to integrate all platforms at the same time. Configure only the provider you want to enable; `src/server/order/services/init-providers.ts` registers each adapter only when that provider's required environment variables are present.

When adding payment configuration, update `src/env.js`, `.env.example`, adapter registration, and the relevant provider documentation.

## Provider Selection

Gateway resolution lives in `src/server/order/services/resolve-gateway.ts`.

Priority order:

1. Explicit checkout input `gateway`.
2. `FORCE_PAYMENT_GATEWAY`.
3. User payment preference when the adapter is registered.
4. Default `STRIPE`.

Frontend entry points should pass a gateway only when the user explicitly chooses a method. Otherwise, let the backend resolver choose.

`FORCE_PAYMENT_GATEWAY` is for local testing and can force `STRIPE`, `NOWPAYMENTS`, or `LEMONSQUEEZY`.

## Stripe

Stripe is an optional card payment and subscription provider. Configure these variables when enabling Stripe:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

The webhook should point at `/api/webhooks/stripe`. Stripe supports `confirmPayment()` polling compensation, so local success pages can actively confirm the Stripe Checkout Session when webhooks are delayed.

## NowPayments

NowPayments is an optional crypto payment provider. Configure these variables when enabling NowPayments:

```env
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_PAY_CURRENCY=usdttrc20
```

The IPN/webhook should point at `/api/webhooks/nowpayments`. `NOWPAYMENTS_PAY_CURRENCY` is the default payout currency; the code default is used when it is not set.

## LemonSqueezy

LemonSqueezy is used as a Merchant of Record provider. It is best suited for simpler global SaaS billing where tax collection and remittance should be handled by the payment provider.

### Variant ID Configuration

Unlike Stripe (which creates prices dynamically via `price_data`), LemonSqueezy requires products and variants to be pre-created in the LemonSqueezy dashboard. The local database product must reference the corresponding LemonSqueezy variant ID through `Product.metadata`.

This means **two data sources must stay in sync**:

1. **Local database**: `Product.price`, `Product.name`, `Product.interval`, etc.
2. **LemonSqueezy dashboard**: product name, variant, and pricing configuration.

The framework uses `custom_price` to override the LemonSqueezy variant price with the local database price, so **the actual charged amount always comes from your database**. The variant ID is only used as a checkout entry point.

### Charged Amount Source

The LemonSqueezy variant tells LemonSqueezy which hosted checkout/product to use, but it is not the source of truth for pricing inside the framework. When creating a checkout, the adapter sends the local order amount to LemonSqueezy as `custom_price`:

- One-time credit package amounts come from `Product.price` / `ProductPrice`.
- Subscription amounts come from the local subscription product price.
- The LemonSqueezy dashboard variant price is overridden by `custom_price`.

Therefore, developers should update product prices in the local database or Admin product configuration first. The LemonSqueezy variant price only needs to remain a valid checkout entry point.

Supported metadata keys for the variant ID (any one will work):

- `lemonsqueezy.variantId` (nested object)
- `lemonsqueezy.variant_id` (nested object)
- `lemonsqueezyVariantId` (flat key)
- `lemonsqueezy_variant_id` (flat key)
- `lemonSqueezyVariantId` (flat key)

Example `Product.metadata`:

```json
{
  "lemonsqueezy": {
    "variantId": "123456"
  }
}
```

### Setup Steps

1. Create a LemonSqueezy store.
2. Create products and variants in LemonSqueezy. The variant price does not need to match the local database price (it will be overridden by `custom_price`).
3. Add the variant ID to local product metadata using one of the supported keys above.
4. Configure LemonSqueezy environment variables:

```env
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_TEST_MODE=true
```

Optional local Dashboard smoke-test fallback:

```env
LEMONSQUEEZY_TEST_VARIANT_ID=
LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID=
```

Production should configure real variant IDs through `Product.metadata` and should not rely on the test fallback.

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

Checkout creation uses LemonSqueezy `POST /v1/checkouts`. The adapter passes local `orderId` and `paymentId` through `checkout_data.custom`; LemonSqueezy returns this data in webhook `meta.custom_data`, which lets the webhook pipeline map back to local payment rows.

Webhook verification uses `X-Signature` and HMAC-SHA256 with `LEMONSQUEEZY_WEBHOOK_SECRET`.

### Local Webhook Testing

To test successful payment, subscription activation, renewal, or cancellation locally, LemonSqueezy must be able to reach the local Next.js webhook. ngrok is the simplest option:

```bash
ngrok http 3000
```

After ngrok gives you an HTTPS URL, for example `https://example.ngrok-free.app`, update local `.env` and restart the dev server:

```env
APP_URL=https://example.ngrok-free.app
NEXTAUTH_URL=https://example.ngrok-free.app
AUTH_URL=https://example.ngrok-free.app
LEMONSQUEEZY_WEBHOOK_SECRET=your-local-webhook-secret
```

Configure the webhook in the LemonSqueezy dashboard:

```text
URL: https://example.ngrok-free.app/api/webhooks/lemonsqueezy
Signing secret: your-local-webhook-secret
```

The signing secret must exactly match `LEMONSQUEEZY_WEBHOOK_SECRET`; otherwise `X-Signature` verification fails and the event will be ignored or fulfillment will not complete. If a payment has completed but local state does not change, resend the webhook from LemonSqueezy and check `PaymentWebhookLog`, the ngrok inspector, and the dev server logs.

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

The dashboard page includes a **Payment Test** button (under Module Status > Payment) that opens an interactive test dialog. It supports:

- Selecting a payment provider (only configured providers are selectable).
- Creating one-time and subscription checkouts (opens real test checkout pages).
- Confirming payment status via polling.
- Querying orders, payments, credits balance, and subscription status.
- Provider-specific tests (Stripe saved cards, NowPayments supported currencies).

For payment changes, test:

- Checkout creation.
- Webhook signature rejection.
- Successful entitlement delivery.
- Duplicate webhook behavior.
- Refund, renewal, or subscription state transitions when touched.

For adapter changes, also test:

- Adapter registration with and without required environment variables.
- Gateway resolution via explicit input, `FORCE_PAYMENT_GATEWAY`, and user preference.
- Webhook signature rejection for invalid signatures.
- One-time purchase webhook mapping to `Payment` and `Order`.
- Subscription initial purchase, renewal, cancellation, expiration, and failed payment behavior.
- Local PostgreSQL and Redis flows using an isolated Docker Compose project and `down -v` cleanup when running integration smoke tests.
