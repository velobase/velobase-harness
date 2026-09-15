# Complete-example payments adapter

The independent `@velobase/payments` package handles record lifecycle and provider contracts. This adapter binds it to the existing Order and Payment tables. No data copy or new payment schema is required.

The host's product checkout still determines eligibility, discounts, quantity, product snapshots and the chosen provider. Its `create-order` and `create-payment` services delegate persistence to the business package. PostgreSQL transaction-scoped advisory locks serialize customer draft preparation and preparation/status writes for each order. Equivalent drafts include the order type and snapshot; payment reuse includes amount, currency, gateway, subscription mode and requested crypto currency.

The payment webhook and compensating confirmation paths use the package's state transition rules. Status writes compare the current row and preserve existing provider IDs. Persistence failures are returned for provider replay rather than acknowledged as a successful delivery. Verified status processing has no new-payments feature gate: it remains available for already accepted work. Subscription lifecycle updates continue separately and cannot turn a captured payment into an expired payment. Fulfillment checks the latest payment status before dispatching to the existing credit/subscription fulfillers.

Direct-charge and quick-purchase success paths record `SUCCEEDED` before fulfillment. A downstream failure retains the captured payment for confirmation/fulfillment retry. New quick purchases no longer write the legacy `SUCCESS`/`PAID` spellings. Existing `SUCCESS` records remain recognized as captured records; no historical data migration is required for this compatibility handling.

The customer payment query checks ownership before invoking the legacy provider refresh, because that refresh can settle an existing payment. Customer order reads use the same owner-scoped business service. Existing list APIs and Admin pages retain their compatibility pagination; the package's new repository readers are cursor-based with 20 rows by default.

`src/server/order/providers/types.ts` re-exports neutral contracts, and its registry is a host-owned instance of the shared registry. The complete example continues choosing its existing combined payment/subscription adapters. One-off-only hosts can register adapters without subscription methods.

The Stripe adapter now delegates one-off checkout creation, confirmation, expiration and signature verification to `@velobase/payments-stripe`. One-off Checkout events use its paid/pending/async/expired normalization. Subscription creation/lifecycle, saved-card charges, cashflow, disputes and fulfillment remain in the complete example. Its lazy `getStripe()` singleton uses the package's client factory and pinned API version; app code still obtains the client through that singleton.

The complete example still statically includes checkout/provider integrations and its fulfillment dependencies. The package extraction does not mean those SDKs are removable from this host by changing a feature ID. Its generic `cancelUnattemptedOrder` is available to new host flows; the existing complete-example cancellation route retains its compatibility behavior pending the provider-session lifecycle extraction.
