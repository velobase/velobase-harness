# Local Velobase credit ledger

`createVelobaseLedger({ pool, tenantId, projectId, onError })` implements the credit service using the open-source [`velobase/velobase`](https://github.com/velobase/velobase) PostgreSQL engine, in the application process. It does not make HTTP requests or require a billing API key.

The dependency is pinned to the official v0.1.1 release archive; the lockfile records its integrity. The package is not currently available from the npm registry.

## Persistence and deployment

The complete example shares `DATABASE_URL` with the application and uses a dedicated `pg` pool with `search_path=velobase_billing`. Prisma continues to own the application's original schema. The engine requires its own `pg` transaction interface and never creates another Prisma client.

- Deploy with `pnpm db:migrate` before starting Web or Worker. The committed `20261026090000_local_credit_ledger` Prisma migration installs the engine's tables, constraints and indexes in the separate schema.
- For development using `db:push`, run `pnpm billing:migrate` as well. `pnpm dev:local` runs it automatically.
- `BILLING_TENANT_ID` and `BILLING_PROJECT_ID` default to `default`. Keep both stable after granting credits; changing them selects a different ledger scope.
- Do not run the upstream `migrate()` against these tables: Harness owns the schema migration, matching upstream v0.1.1 migrations 0001 and 0002. Upgrade the package and migration together.
- No remote balances or history are imported. Existing remote records are not modified. Any balance import must be planned separately before cutting over an existing deployment.

## Operations

The accounting engine owns all mutations: grant, reserve, settle and release. Harness maps its existing credit service vocabulary to these operations. Scoped SQL reads supply the UI's all-wallet balances, grant receipts, settlement timestamps, allocation amounts, history totals and operation filters, which the engine's compact public read API does not expose together.

All amounts are safe integers. Settlement allows zero, releases the unused reservation, and rejects amounts above the reservation. There is no implicit overage or negative balance. New grants/freezes/deductions obey the persisted credits feature switch; accepted obligations can still settle when the switch is off.

`postConsume` reserves the exact charge and settles it using the same transaction identity. The reservation carries an automatic settlement deadline, so a crash between the two commits leaves recoverable work. Retrying uses the same identity and payload. A failure after reservation is never reported as a rejected initial write.

The platform `billing-settlement` worker scans due reservations every minute in batches of 100. It runs independently of the new-spending switch, completing automatic releases, settlements and interrupted deductions. Run `SERVICE_MODE=web,worker` or a separate Worker service to enable recovery. The scheduler uses the same idempotent engine operations and logs the original errors with transaction context.

History defaults to 20 entries, with timestamp/UUID cursors, an exact filtered total, and one extra row to determine `hasMore`. Engine operations appear as `GRANT`, `FREEZE`, `CONSUME`, and `UNFREEZE` in the UI. A direct deduction creates both reserve and settlement entries.

Only confirmed pre-mutation validation, insufficient-balance and missing-reservation errors become `CreditLedgerError`. The original error remains its cause; database and uncertain errors propagate unchanged.
