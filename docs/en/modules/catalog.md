# Harness module catalog

These capabilities belong to the existing Harness product and UI. Admin operates the capabilities included in its deployment. Code optionality and runtime switches are separate requirements; the root application still has static dependencies that must be addressed before claiming every package is removable.

| Capability | Category | Responsibility / dependencies | Existing entry / feature ID |
| --- | --- | --- | --- |
| Users | Foundation | Accounts, permissions, existing Admin | `/admin/users` |
| Products | Business | Catalog, prices and publication | `/admin/products` |
| Orders and payments | Business | Orders, payments and refunds; payment connection | `/admin/orders` |
| Subscriptions | Business | Existing membership periods and entitlements; payments | `src/modules/subscriptions` |
| Credits | Business | Balances, grants, reservations and ledger history | `/admin/credits` |
| Promo campaigns | Business | Campaigns, rewards and redemption records | `/admin/promo-codes` |
| Newcomer offers | Business | Eligibility and timed offers; payments | `newcomer-offers` |
| Daily rewards | Business | Sign-in rewards; credits | `daily-bonus` |
| Sharing | Business | Existing conversation publication, access and revocation | `/admin/sharing` |
| Email management | Business | Mailbox, tickets and manual replies; no model required | `/admin/email` |
| AI support | Extension | Mail automation and suggestions; separately configured model | `ai-support` |
| Outreach | Business | Scenes, templates and delivery; email connection | `/admin/touches` |
| Affiliates | Business | Referrals, commissions and payouts | `/admin/affiliate/commissions` |
| Attribution | Business | Acquisition and conversions; analytics/ads connections | `attribution` |
| AI chat | Business | Existing conversations, agents and tools; model connection | `/chat` |
| Image generation | Business | Existing tasks and assets; provider and storage | `image-generation` |
| Projects | Business | Existing document and repository organization | `projects` |

| Technical module | Responsibility |
| --- | --- |
| Auth, authorization, Prisma, config and logging | Existing framework infrastructure |
| Admin and internationalization | Existing UI and translations |
| module-runtime | Capability membership, dependencies and runtime state |
| mailbox and email-transport | IMAP/MIME and SMTP protocols |
| Worker, Redis and queues | Async execution and scheduling |
| Payment, model, analytics and notification adapters | External protocols and credentials, separate from business switches |
| Storage | Existing public/private asset abstraction |

[Start Harness](./getting-started.md), then [configure its modules](./composition.md). Disabling new operations preserves history, refunds, cancellation and accepted work.
