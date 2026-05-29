# AI Agent Guide

This file is the universal entry point for AI coding tools such as Cursor, Claude Code, GitHub Copilot, Windsurf, and generic agent runners.

Read this file first. Then follow the task and integration routers below before editing code.

## Task Router

IF the user asks to build a new product from scratch:

- MUST read `docs/en/ai/design.md`.
- MUST complete domain design before writing product code.

IF you are about to create a new business module under `src/modules/`:

- MUST read `docs/en/ai/new-module.md` first.

IF you are about to create or modify tests (`*.test.ts`, `*.spec.ts`, or `e2e/*`):

- MUST read `docs/en/ai/testing.md` first.

After development is complete:

- MUST run the checks in `docs/en/ai/completion-checklist.md`.
- MUST tell the user which checks were run and which were skipped.

## Integration Router

IF you touch authentication or login:

- Read `docs/en/integrations/auth/README.md`.

IF you touch billing, orders, payments, subscriptions, products, credits, or promo codes:

- Read `docs/en/integrations/payment/README.md`.

IF you touch email delivery or email templates:

- Read `docs/en/integrations/email/README.md`.

IF you touch database, Prisma, migrations, Redis, or env-backed persistence:

- Read `docs/en/integrations/database/README.md`.

IF you touch file upload, object storage, CDN URLs, or asset access:

- Read `docs/en/integrations/storage/README.md`.

IF you touch analytics, feature flags, or product events:

- Read `docs/en/integrations/analytics/README.md`.

IF you touch ad attribution or conversion upload:

- Read `docs/en/integrations/ads/README.md`.

IF you touch queues, workers, processors, or scheduled jobs:

- Read `docs/en/integrations/queue/README.md`.

IF you touch anti-abuse, captcha, rate limiting, IP, country, or security boundaries:

- Read `docs/en/integrations/security/README.md` and relevant `docs/en/features/*/README.md`.

## Core Rules

### General

- Keep framework code generic. Put product-specific behavior in `src/modules/<name>/` unless an existing framework extension point is the correct owner.
- Validate all user input with Zod or an equivalent schema.
- Paginate list queries with cursor-based pagination; default page size should be 20.
- Use `createLogger("module-name")` for structured logs.
- Use `src/env.js` for environment variables. Do not read `process.env` directly in application code.
- Do not revert user changes unless the user explicitly asks.

### Productization

- When building a new product, customize `src/app/page.tsx` and i18n copy. Do not ship the default template landing page.
- `/` is a public landing page. Do not redirect signed-in users away from it by default.
- Route authenticated CTAs to the product's real main workflow, not to an unused template dashboard.

### Auth

- Server Components use `await auth()` from `@/server/auth`.
- Client Components use `useSession()` from `next-auth/react`.
- Login UI must use `useLogin()` from `@/components/auth/use-login`.
- Never store sensitive auth data, JWTs, or session tokens in client state or local storage.

### Database

- Use `db` from `@/server/db`; never create a new PrismaClient.
- Use `redis` from `@/server/redis`; never create ad hoc Redis connections.
- Schema changes may use `npx prisma db push` locally, but committed deployable changes require `prisma/migrations/*`.

### API

- Mutations must use `protectedProcedure` unless the endpoint is intentionally public.
- Routers stay thin: choose procedure, validate input, call service.
- Business logic belongs in service modules, not router bodies.
- Hono routes live under `src/api/routes/` and must not import Next.js-only APIs such as `next/headers` or `next/server`.
- The Hono API service is disabled by default. Use it only for intentional standalone external HTTP routes; current production webhooks live in Web under `src/app/api/**`.

### Billing And Payment

- Get Stripe through `getStripe()` from `@/server/order/services/stripe/client`.
- Do not call payment SDKs directly from frontend code.
- Do not hard-code prices. Query product data.
- Payment status changes are webhook-driven; frontend confirmation is only compensating polling.
- Entitlement delivery goes through fulfillment and billing services. Do not grant credits directly in webhook handlers.

### Email And Storage

- Send email through `sendEmail()` from `@/server/email`; do not call provider SDKs directly.
- Use `@/server/storage` exports for storage; do not call S3-compatible SDKs directly in product code.

### Workers

- Create workers through `createWorkerInstance()`, not `new Worker()`.
- New queues must be exported from `src/workers/queues/index.ts` and processors from `src/workers/processors/index.ts`.
- Worker jobs must be idempotent, especially for billing, entitlement, email, and webhook side effects.

### Analytics, Ads, And Side Effects

- Client analytics use `track()` from `@/analytics`.
- Server analytics use `safeTrack()` from `@/analytics/server`.
- Never import `@/analytics` in server code.
- Define new analytics events under `src/analytics/events/` before using them.
- Core flows emit domain events through `appEvents.emit()` from `@/server/events/bus`.
- Do not call pluggable modules such as PostHog, Google Ads, Lark, or Telegram directly from core flows.

### Modules

- Module enablement belongs in `src/config/modules.ts`.
- Pluggable modules implement `FrameworkModule` from `@/server/modules/registry`.
- Disabled modules must not expose routers or webhook endpoints.
- Modules communicate through the event bus, not direct imports between modules.

### Internationalization

- User-visible UI copy must use `useTranslations()` or `getTranslations()`.
- Do not hard-code user-visible English strings in JSX.
- Framework namespaces are reserved: `common`, `nav`, `auth`, `billing`, `payment`, `aiChat`, `errors`, `account`, `admin`.
- Product copy belongs under `landing`, `product`, or module-specific namespaces.

### Debugging

- For production issues, ask the user for the latest runtime or deploy logs first.
- Reproduce with the local Docker database workflow before pushing a fix when possible.
- Use `docs/en/debugging/online-local-debug.md` for the full workflow.
