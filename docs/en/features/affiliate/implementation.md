# Complete-example affiliate adapter

`server/service.ts` maps the existing Prisma affiliate tables to `@velobase/affiliate`. `server/referrals.ts` binds new-user referral events. The legacy service paths under `src/server/affiliate` remain compatibility entry points for the existing account/Admin routers; they delegate money/state transitions to the package.

`server/credits-extension.ts` is the host's separate Credits integration. It reserves a payout, calls the existing billing abstraction with a stable idempotency key, then settles the reservation. A timeout retains the request and exposes it for retry in the account exchange page. Affiliate balance/history/cashout code imports no Credits service.

Payment and authentication code publish domain events. The affiliate module subscribes only when deployed. Reversal listeners remain registered even with `AFFILIATE_MODE=off`, while new operations use the current feature state. Existing root tables and identifiers are retained; the independent Core adapter's migration is for separate small-host databases only.

No test, build or application execution was performed.
