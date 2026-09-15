# Stripe subscription lifecycle adapter

`createStripeSubscriptionProvider({ getClient })` implements the subscription provider port from `@velobase/subscriptions`.

Add this technical package explicitly to a host that selects Stripe.

It uses the Stripe 19.1.0 client supplied by the host; it does not read environment variables or create a client when the adapter is constructed.

The complete example supplies its existing lazy `getStripe()` singleton.

Other hosts supply their validated server configuration and client lifetime.

This package has no dependency on one-off payment business code, credit delivery, the database, AI, mail or worker modules.

The adapter reads current provider state, schedules cancellation, cancels immediately and requests trial conversion.

It normalizes Stripe status and cancellation timestamps.

Clover period boundaries come from subscription items; shared boundaries are exposed only when the returned item list is complete and every item agrees.

Those timestamps describe billing and are not proof of paid delivery.

Cancellation first checks the current remote state and returns already-confirmed cancellation without another write.

Immediate cancellation sets `invoice_now: false` and `prorate: false`; it does not issue a refund or settle pending invoices.

Transport errors propagate so the host cannot mistake uncertainty for successful cancellation.

Trial conversion requires the provider still to report `trialing` and uses an idempotency key derived from the subscription and that trial's end timestamp.

It ends the trial without proration; subsequent verified invoice events own paid fulfillment.

Mutation calls disable SDK-level network retries.

The host retains the accepted operation and decides when to reconcile or repeat it.

`normalizeStripePaidSubscriptionInvoice` is a pure parser for an already verified paid invoice.

It takes the purchased period from the non-prorated recurring invoice lines, validates subscription identity and requires all recurring lines to agree.

It supports legacy and Clover subscription references.

Invoice-level period metadata and the current remote subscription period are not used to infer a delayed invoice's entitlement.

Truncated line lists, different periods and proration-only invoices require a separate host policy; this parser does not guess or retrieve additional pages.

The `/checkout` export supplies `createStripeRecurringCheckout`, `assertRecurringCheckoutMatch` and a cancellation-only portal flow.

It validates trusted recurring terms, copies the request identity/digest to the Checkout Session and subscription, and uses a stable request-derived idempotency key with SDK retries disabled.

Its quote comparison includes price, currency, interval/count, quantity and any selected existing customer.

The host must persist the request before calling create, retain its connection, and bound uncertain retries to the provider's idempotency window.

Trial days, absolute session expiry and an explicit 3DS policy are host-selected parameters; the adapter does not choose an offer or calculate a moving expiry.

The `/billing` export supplies current subscription reads, lookup of a request's subscription checkout and a paid-invoice reader for a single regular recurring line.

It reads the purchased invoice period and that line's Stripe Price; it does not substitute the current subscription period for an old invoice.

Its fixed-price reference does not install the complete example's additional commercial policies.

No Stripe requests, tests, builds or application runs were executed while preparing it.
