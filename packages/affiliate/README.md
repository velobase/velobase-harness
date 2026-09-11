# Affiliate business service

`@velobase/affiliate` owns commission accrual, holds, balances, payout reservations, settlement, reversals and restoration.

Its only dependency is Zod.

It imports no application, database client, payment provider, credit ledger, queue or UI framework.

`affiliateFeature` is deployment metadata; including it alone does not install routes or business code.

The host supplies a trusted sale identity, payer/referrer, gross USD cents, commission rate and release date.

The service validates amounts, rejects self-referrals, freezes the first accrual and uses `(sourceType, sourceExternalId, sourceSequence)` as its identity.

Replaying a sale does not postpone maturity, double-credit a balance or restore a reversed commission.

No sale endpoint is provided for untrusted clients.

## Repository contract

`withAccount(userId, work)` must lock the owner before reading mutable earning/payout state.

Every operation inside it must use the same database transaction and scope reads/writes to that owner.

`applyLedger` must insert the unique ledger entry and persist the supplied balances atomically.

Any failure rolls back the transaction.

Do not catch a uniqueness error and continue a failed PostgreSQL transaction.

Owner lookups outside the transaction only locate its lock; state is read again inside it.

Database amounts are integer USD cents with an upper bound of 2,147,483,647 per bucket.

The module does not perform currency conversion.

## Operation state

The feature switch stops new commission accrual.

The host applies the same switch to referral enrollment.

Balance reads, maturity, payouts, reversals and history remain available for existing obligations.

Reversals consume the affected pending commission or available funds, then record a shortfall as debt.

They never consume another payout's reservation.

Maturity and released reservations repay debt before adding available funds.

Payout actions cannot reopen a settled request; repeating the same final action is harmless.

Admin restoration is a new ledger transition, so repeated reverse/restore cycles remain recorded.

`reservePayout` reserves funds before any external operation.

Manual cashout settlement requires a transfer reference.

The package never initiates a transfer.

Its retained `EXCHANGE_CREDITS` settlement type supports existing data without importing a credit service: only a separately installed extension calls the external ledger with a stable request identity, then calls `completeExchange`.

Uncertain external results must keep their reservation and be resumed with that identity.

## Complete example

`src/modules/affiliate/server/service.ts` binds existing tables without copying or replacing financial records.

The existing account/Admin pages use the package through compatibility service entry points.

`src/server/modules/affiliate.ts` subscribes to signup, payment, renewal and reversal events.

The complete example adds Payments as a dependency for **new commissions** in its own deployment catalog; this is not a package-wide dependency.

Credit exchange lives in `src/modules/affiliate/server/credits-extension.ts` and is composed by that host's API.

Its provider request is outside the database transaction; uncertain attempts retain a durable reservation and can be resumed from the user's exchange page.

New exchanges follow the Credits switch.

An existing reserved exchange remains resumable while new credit operations are disabled.

Older complete-example renewal records may contain synthetic `event_bus:renewal:…` source IDs instead of invoice IDs.

They are retained unchanged.

Refunds of those historical renewals require an operator to identify and reverse the corresponding earning in Admin; this extraction does not guess an invoice mapping or rewrite financial history.

New renewal records use the actual invoice ID.

Source implementation has not been executed or tested under the current no-tests instruction.
