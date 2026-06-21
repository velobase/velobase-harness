# Payment Integration

Payment covers products, orders, subscriptions, credits, payment webhooks, and entitlement delivery.

Supported providers:

- Stripe for card payments and subscriptions.
- LemonSqueezy for optional hosted checkout payments and subscriptions.
- NowPayments for optional crypto payments.

## Rules

- Get Stripe through `getStripe()` from `@/server/order/services/stripe/client`.
- Do not call payment SDKs directly from frontend code.
- Do not hard-code prices; query product data.
- Payment status changes are webhook-driven.
- Frontend confirmation is only compensating polling.
- Entitlement delivery goes through fulfillment and billing services.
- Do not grant credits directly in webhook handlers.

## Configuration

Common environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`

Update `src/env.js`, `.env.example`, and provider registration when adding payment configuration.

Module modes:

- `STRIPE_MODE=auto|off|on` controls Stripe provider registration, webhook handling, and Stripe-owned workers.
- `LEMONSQUEEZY_MODE=auto|off|on` controls LemonSqueezy provider registration and webhook handling.
- `NOWPAYMENTS_MODE=auto|off|on` controls NowPayments provider registration, webhook handling, and NowPayments-owned workers.
- `PAYMENT_RECONCILIATION_MODE=auto|off|on` controls payment reconciliation reports. `auto` currently requires Stripe or NowPayments plus Lark.

## Workers

Payment-owned workers are registered from `src/workers/integrations/payment.ts`.

| Worker                      | Owner                                                  | Enablement                                                                           |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `order-compensation`        | Stripe / NowPayments payment compensation              | Stripe or NowPayments is enabled                                                     |
| `subscription-compensation` | Stripe subscription compensation                       | Stripe is enabled                                                                    |
| `payment-reconciliation`    | Payment reconciliation with Lark notification delivery | Stripe or NowPayments and Lark are enabled, unless `PAYMENT_RECONCILIATION_MODE=off` |

`payment-reconciliation` is not a standalone Lark integration. Lark is only the delivery channel for the payment reconciliation feature.

Payment workers are exposed as module `WorkerContribution` entries; `src/workers/start.ts` collects them from the module catalog.

## Webhooks And Idempotency

- Verify webhook signatures before processing.
- Store or check provider event IDs where applicable.
- Make entitlement delivery idempotent.
- Worker compensation should retry safely and never double-grant credits.

## Testing

Admin payment diagnostics are exposed from the `/dashboard` module status panel:

- A configured Stripe module turns green and opens a test dialog for checkout creation, payment confirmation polling, order/payment listing, balance checks, subscription status, and saved-card checks.
- A configured LemonSqueezy module turns green and opens the same payment test dialog for LemonSqueezy checkout creation and shared payment record checks. Local tests can use `LEMONSQUEEZY_TEST_VARIANT_ID` and `LEMONSQUEEZY_TEST_SUBSCRIPTION_VARIANT_ID` when product metadata does not contain LemonSqueezy variant IDs.

For payment changes, test:

- Checkout creation.
- Webhook signature rejection.
- Successful entitlement delivery.
- Duplicate webhook behavior.
- Refund, renewal, or subscription state transitions when touched.
