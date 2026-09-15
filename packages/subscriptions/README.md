# Subscriptions

`@velobase/subscriptions` owns subscription records, accepted periods, ownership, cursor history and cancellation/state reconciliation.

Its only dependency is Zod.

It imports no payment SDK, database, credit ledger, AI provider, notification channel or queue.

The feature catalog keeps the commercial Subscriptions → Payments dependency; package dependencies and a host's technical adapters are explicit choices.

## Compose the business service

Add this source package as a `workspace:*` dependency.

Supply a `SubscriptionRepository`, the host's persisted `isEnabled()` check, and a provider resolver to `createSubscriptions`.

Register only the selected provider adapters; the [Stripe lifecycle adapter](../subscriptions-stripe/README.md) is separate.

An explicitly manual gateway can be declared through `isManualGateway`; missing provider credentials or a missing automatic provider identity must not silently become a manual subscription.

The repository serializes customer enrollment and per-subscription operations.

It also protects the provider identity across customers and each period's unique key across subscriptions.

Its `update` compares the persisted revision and changes subscription state plus any immediate cycle closure atomically.

The [complete-example binding](../../src/modules/subscriptions/README.md) uses the existing Prisma tables and transaction-scoped advisory locks.

| Operation                      | Purpose                                             | New-subscription switch |
| ------------------------------ | --------------------------------------------------- | ----------------------- |
| `create` / `createCycle`       | New authorized enrollment or period                 | Required                |
| `settleCreate` / `settleCycle` | Trusted fulfillment of previously accepted business | Not required            |
| `get` / `current` / `list`     | Owner-scoped reads and history                      | Not required            |
| `listForAdmin`                 | Administrator history, authorized by the host       | Not required            |
| `refresh` / `cancel`           | Reconcile or cancel an existing owned relationship  | Not required            |
| `convertTrial`                 | Request a new paid conversion                       | Required                |

`settleCreate` and `settleCycle` are server settlement ports, not customer mutations.

Verify payment/trial eligibility before using them.

Period creation alone does not prove that a payment succeeded or that an entitlement was delivered.

Do not let customers choose owner IDs, provider IDs, plan snapshots or period dates to grant themselves access.

## Period identity and delivery

Every new cycle requires a stable `uniqueKey`, subscription identity, optional payment identity, and an end strictly after its start.

A duplicate key for the same subscription/payment/type returns the original period, including its original dates.

A key reused for a different association is rejected.

Sequence assignment belongs to the serialized transaction.

Use the returned period and its identity for downstream grants.

A cycle already existing is not proof that a separate credit/product delivery succeeded.

The host owns idempotent delivery and its completion receipt; a creation timestamp is not a delivery receipt.

`@velobase/subscriptions/delivery` supplies `createSubscriptionDeliveries(repository)` for that boundary.

Its `settle(identity, makePlan, deliver)` operation prepares a period and immutable effect plan in one host transaction, then delivers the remaining effects and acknowledges each consumer receipt.

A retry reads the saved plan without invoking `makePlan` again.

Completion requires all planned effects to have receipts.

Each effect has a stable key, a host-defined kind and a JSON payload: the package imports no credit service or notification channel.

The repository must serialize preparation by delivery identity, validate owner/subscription identity, and commit period changes plus the plan atomically.

The consumer must provide durable idempotency for the exact key and payload, or handle uncertain remote outcomes before returning success.

A crash after a remote write and before the local acknowledgement can replay the same effect.

This is at-least-once delivery, not a promise of exactly-once external effects.

The complete example explicitly supplies a credits consumer and stores its account/ledger receipt; another host can select its own entitlement consumer.

An optional `onCycleCreated` hook runs after persistence and may run again on a replay.

The host can emit a domain event for its selected outreach integration.

Financial delivery requires a durable host workflow; this hook is not a durable event queue.

The package never imports a reminder sender.

`current` uses the repository's chosen eligible relationship and validates that its current cycle has started, remains active, is not deleted and has not expired.

The host owns plan tiers and how provider billing states affect access.

Provider period metadata is not automatically converted into a paid entitlement.

## Cancellation and state

The default cancellation schedules the end of renewal; immediate cancellation is an explicit server choice.

Automatic subscriptions call the selected provider before changing local state.

A provider error, missing identity or unconfirmed result leaves the local relationship available for reconciliation.

Revision comparison rejects a snapshot fetched before another update; refetch provider state before retrying.

A terminal subscription cannot be revived by a late active snapshot through this service.

Immediate confirmed cancellation closes active periods in the same persistence transaction.

Period-end cancellation retains them.

Explicitly manual gateways perform a local cancellation because they own no automatic renewal contract.

Cancellation does not promise or initiate a refund; refunds, pending invoices, entitlements and credit reversals are separate selected policies.

Turning the feature off stops new enrollment and trial conversion.

Retain the repository, provider adapter, history, cancellation and accepted settlement flows for existing relationships.

Removing code requires resolving or transferring those obligations, not just deleting a feature ID.

`@velobase/subscriptions/checkout` defines frozen recurring checkout terms and the create/inspect/expire provider port without an SDK dependency.

The provider resolver for lifecycle operations receives both the gateway and the stored subscription, so an adapter can select that relationship's original connection.

Its fixed-price membership policy is separate from the complete example's trials, upgrades and credit delivery.

These packages are repository source packages, not published npm releases.

No tests, builds, application runs, migrations or provider requests were executed for this extraction.
