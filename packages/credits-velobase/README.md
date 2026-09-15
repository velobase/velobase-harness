# Velobase credit ledger adapter

`createVelobaseLedger(apiKey)` implements the `CreditLedger` port from `@velobase/credits`.

This technical package alone imports `@velobaseai/billing`.

It maps provider wallet/source balances, cursor history, deposit, freeze, consume, release and direct deduction responses to neutral business types.

The adapter makes no request when constructed.

The ledger adapter makes one HTTP attempt per invocation (`maxRetries: 0`).

This preserves the distinction between a rejected first attempt and an earlier uncertain write; the application controls retries with the stored identity.

The existing provider's deposit idempotency key and billing transaction ID are preserved.

Confirmed pre-mutation rejections are represented by `CreditLedgerError`; network/uncertain failures are not treated as proof that an earlier attempt did nothing.

A missing customer is represented as an empty balance/history only after the provider returns `not_found`.

The optional `/details` export contains response normalization without loading the SDK.

`createVelobaseClient` remains available to technical integrations; business code uses the service/ledger interface.

The complete example resolves this adapter lazily from its validated environment.

Credentials never belong in the client bundle or local storage.

This extraction keeps the existing SDK version and API mappings; no provider request was executed.
