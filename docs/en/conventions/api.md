# API Conventions

This document defines how AI agents and developers should create and modify tRPC routers, Hono routes, webhooks, and product APIs.

## API Zones

### Locked Zone: Framework Platform APIs

Framework APIs are reusable SaaS capabilities. Product code may call them, but should not change their public procedure signatures or add product-specific behavior inside them.

Examples:

- `product.*`
- `billing.*`
- `order.*`
- `membership.*`
- `promo.*`
- `account.*`
- `admin.*`

Rules:

- Call framework APIs from product flows when needed.
- Do not change existing router signatures unless explicitly requested.
- Do not add product-specific logic to locked routers.

### Extension Zone: Third-Party Integration APIs

Integration APIs wrap external services. They may be extended through provider patterns, but existing public interfaces should remain stable.

Examples:

- `storage.*`
- `auth/[...nextauth]`
- `src/app/api/webhooks/stripe`
- `src/app/api/webhooks/nowpayments`
- `src/app/api/webhooks/resend`
- `src/app/api/webhooks/telegram`
- `src/app/api/lark/webhook`

Rules:

- Read the matching `docs/en/integrations/*/README.md` before editing.
- Add providers by following existing provider boundaries.
- Do not call external SDKs directly from product code.

### Free Zone: Product APIs

API routes call services in `src/server/<capability>/`. Private product APIs belong in the private product repository.

Rules:

- Create new routers under the module.
- Mount routers in `src/server/api/root.ts`.
- Keep routers thin and move business logic into service modules.
- Use events, queues, billing, storage, and email through framework abstractions.

## tRPC Rules

Procedure selection:

```text
Public read                            -> publicProcedure
Authenticated read/write               -> protectedProcedure
Admin-only operation                   -> adminProcedure
High-frequency operation needing limit -> rateLimitedProcedure
```

General rules:

- Validate every input with Zod or an equivalent schema.
- Mutations are protected unless intentionally public.
- List queries use cursor-based pagination.
- Default page size should be 20.
- Routers should select the procedure, validate input, and call a service.
- Services enforce ownership and business invariants.

## Hono And Webhook Rules

- Current production webhooks live in Web under `src/app/api/**`.
- Hono routes live under `src/api/routes/` only when the optional API service is explicitly enabled.
- Hono routes must not import Next.js-only APIs such as `next/headers` or `next/server`.
- Do not move an existing Next Route Handler to Hono unless the deployment will enable the API service.
- Webhooks must verify signatures before processing.
- Webhooks and workers must be idempotent.
- Disabled pluggable modules must not expose active webhook endpoints.

## Errors

- Use `TRPCError` for expected tRPC business errors.
- Do not leak secrets, tokens, database connection strings, or raw sensitive provider responses.
- Log enough context for debugging without exposing private data.

## Internationalization

User-visible API-driven UI copy should be rendered through i18n on the frontend. Do not hard-code user-visible English strings in JSX.
