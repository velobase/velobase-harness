# Payments

`@velobase/payments` is the business service for order/payment records, owner-scoped history, payment preparation and verified status transitions.

Its only dependency is Zod.

It does not import a database, payment SDK, subscription service, credit ledger, AI provider or notification channel.

## Developer composition

Add this package as a `workspace:*` dependency to the selected host, then:

1.

Supply a `PaymentRepository` to `createPaymentRecords`, including the transaction and cursor-query operations.

The [complete-example adapter](../../src/modules/payments/README.md) shows the existing Prisma-table implementation.

Other hosts use their own schema/migration and authentication.
2.

Supply `isEnabled()` from the host's persisted Payments setting and technical configuration.

Add `paymentsFeature.id` to the deployed feature list and register the host's business pages/API.

The generic definition does not require the Products module; the host supplies a trusted quote/reference and snapshot.

The complete example explicitly adds its Products dependency.
3.

Import only the selected technical adapters and register them with `createPaymentProviderRegistry()` from `@velobase/payments/providers`.

A provider used only for one-off payments implements `OneOffPaymentProvider`.

It does not need subscription creation or lifecycle methods.

The optional `SubscriptionPaymentProvider` contract and combined `PaymentProvider` type support hosts that choose recurring payments.
4.

Authorize users before calling the customer readers, and authorize administrators before using `listOrdersForAdmin` or `listPaymentsForAdmin`.

Pagination uses cursors and defaults to 20.

Derive `userId` from the session, never from a browser-supplied owner field.
5.

Keep provider request creation, signature verification, immutable cashflow evidence, fulfillment and refund operations in explicitly selected host adapters.

Call `recordVerifiedState` only after verifying the provider evidence and its association with the payment.

The method is not a public/customer mutation and is not an alternative to verifying a webhook signature, amount or remote identity.

These are source packages in the repository, not published npm products.

The separate [Stripe adapter](../payments-stripe/README.md) implements one-off hosted checkout, confirmation, expiration and signature verification.

This business package does not import it.

The complete example retains its existing host integrations.

Do not describe a manifest edit as uninstalling the complete example's SDKs.

## Record lifecycle

`createOrder` takes the host's trusted price and product/reference snapshot.

It serializes record preparation by customer and may reuse an equivalent open draft.

`preparePayment` serializes by order, checks ownership, rejects closed/expired orders and already settled payments, and requires the amount and currency to match the order.

The adapter includes gateway, subscription mode and any opaque reuse key in its pending-payment lookup; the complete example uses the reuse key to distinguish requested crypto currencies.

Order/payment record reuse does not replace provider idempotency or prove that an external charge happened once.

The technical adapter still owns stable session/request identities, uncertain outcomes and expiration of external checkout sessions.

A local expiry timestamp is not proof that a remote session can no longer accept money.

`cancelUnattemptedOrder` cancels only a pending order with no payment attempt, using an atomic condition.

Once an external attempt exists, the host must resolve it with the selected provider rather than reporting a purely local cancellation as a canceled charge.

Verified state writes are independent of the new-payments switch.

They serialize by order and compare the persisted version/status before updating.

Captured payments cannot return to pending/failed/expired; refunded payments cannot become successful again from a late event.

A confirmed late success can resolve a failed/expired attempt.

The host continues using its idempotent fulfillment flow after recording success; changing payment state alone does not mark an order fulfilled.

## Operation and removal

Turning Payments off stops new order/payment preparation.

Customer and Admin history, verified callbacks and existing settlement remain available when the host retains their routes and technical adapters.

The complete example's existing feature page provides the operational switch and its provider settings remain in the service connections view.

Remove package dependencies, routes, migrations and selected provider imports as a deployment change after transferring or resolving pending checkout sessions, refunds, recurring charges and fulfillment obligations.

Preserve historical evidence separately from the operational switch.

No tests, builds, application runs, migrations or provider requests were executed for this extraction.
