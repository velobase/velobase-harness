# Complete-example credits adapter

`server/service.ts` composes the independent `@velobase/credits` service with the current persisted feature state. The Velobase provider package is imported only when an operation needs it. Legacy `src/server/billing` paths re-export schemas/types and delegate operations, so existing account/Admin routes and stored provider identities are preserved.

New grants, reservations and direct deductions obey the Credits switch. Paid-order fulfillment, existing subscription installments and an already-reserved affiliate exchange use `settleGrant`. Chat captures whether the turn is billable before generation and uses `settleDeduction` for that accepted turn; a turn started while Credits is disabled does not call the ledger. Existing freeze consumption/release and anti-abuse reversal remain settlement paths.

The standalone Core host uses `@velobase/credits-core`; its adjustment-tracking migration is not applied to the complete example's database. No tests, builds or application execution were performed.
