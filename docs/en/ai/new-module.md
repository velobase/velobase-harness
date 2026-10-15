# Add a capability

Registration is independent of source layout. Read the matching integration guides before changing authentication, database, payments, storage, queues or security.

- Keep framework code generic. Private business behavior and documentation belong in the private product repository.
- Put UI in `src/components`, client hooks in `src/hooks`, services in `src/server`, routes in existing API directories, and queues/processors in `src/workers`.
- Reuse the owning service when it already exists. Create only the files needed for the behavior; no directory template or package per capability is required.
- Extract a shared package only when real consumers require an independent dependency boundary.
- Optional contributions still use `FrameworkModule` and `src/config/modules.ts`. Disabled capabilities must reject new execution, while the assigned owner retains history, cancellation, receipts and settlement.
- Validate inputs, derive actor identity from trusted authentication, and enforce ownership in services.
- Accept domain input and its durable execution record in one transaction. Queue delivery is a notification with recovery, not the acceptance authority.
- Keep routers thin and workers idempotent. Use the existing database, storage, billing and event abstractions.
- Add deployable Prisma migrations when changing persistence.

Finish with the [completion checklist](./completion-checklist.md). Respect the user's validation scope; do not add or run automated tests when the user has reserved integration verification for themselves.
