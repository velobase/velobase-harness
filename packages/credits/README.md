# Credits business module

This optional business package owns validated credit operations, balance/history contracts and the boundary between new work and settlement.

Its only dependency is Zod.

It has no payment, product, subscription, model, database, framework or provider SDK dependency.

```ts
import { createCredits } from "@velobase/credits";

const credits = createCredits({
  ledger: () => selectedLedger,
  isEnabled: readPersistedCreditSwitch,
});
```

The host supplies an implementation of `CreditLedger`, authorizes each call and derives account ownership from its authenticated user or trusted event.

A user-facing API should expose their balance/history; grants and deductions are privileged operations.

Use a stable `outerBizId` for grants and `businessId` for reservations/deductions.

Preserve those IDs before the external call, and reuse both identity and payload on retry.

The provider must enforce idempotency and own its atomic ledger.

Zero final consumption is allowed for a reservation that used nothing.

Grants and freezes use integer credits; direct consumption may use fractional credits for token pricing.

The package exports `creditsFeature`, neutral schemas and TypeScript result types.

Its history defaults to 20 rows and uses provider cursors.

`CreditLedgerError` lets an adapter identify an attempt rejected before applying it; an uncertain earlier attempt must still be reconciled, even if a later attempt is rejected.

Choose `@velobase/credits-velobase` for the existing Velobase ledger, or supply another adapter.

Source implementation only: no tests, builds or ledger requests were executed.
