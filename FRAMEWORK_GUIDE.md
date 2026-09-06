# AI SaaS Framework Guide

This is the English canonical framework guide for Velobase Harness. It explains the path from framework template to product implementation.

For Chinese, see [`FRAMEWORK_GUIDE.zh-CN.md`](./FRAMEWORK_GUIDE.zh-CN.md).

## Start Here

Before writing product code:

1. Read [`AGENTS.md`](./AGENTS.md).
2. Complete Phase 0 in [`docs/en/ai/design.md`](./docs/en/ai/design.md).
3. Wait for the user to confirm MVP scope.
4. Implement product-specific behavior under `src/modules/<name>/`.
5. Run [`docs/en/ai/completion-checklist.md`](./docs/en/ai/completion-checklist.md) before final response, commit, push, or deploy.

## Architecture

Velobase Harness is a multiplatform AI SaaS foundation with incremental workspace boundaries:

- Next.js App Router and React for Web.
- Electron Desktop with isolated main/preload/renderer, and one Expo app for Android/iOS.
- Platform-neutral contracts and typed clients shared by all application hosts.
- tRPC for typed application APIs.
- Optional Hono API for standalone external HTTP routes when Web should not own them.
- Prisma, PostgreSQL, and Redis for persistence and queues.
- NextAuth for authentication.
- BullMQ workers for retryable background jobs.
- Event bus and pluggable modules for analytics, ads, notifications, and other side effects.

Runtime services:

See [Multiplatform workspace](./docs/en/architecture/multiplatform.md) for ownership,
platform commands, Linux validation, and how to extend the shared health slice.
`apps/web` owns Web composition while root `src/app` remains a compatible route table.

| Service | Responsibility | Docs |
| --- | --- | --- |
| Web | Pages, UI, App Router, tRPC, current production webhooks | [`docs/en/architecture/web-api-service-split.md`](./docs/en/architecture/web-api-service-split.md) |
| API | Optional Hono routes for independent external HTTP | [`docs/en/architecture/web-api-service-split.md`](./docs/en/architecture/web-api-service-split.md) |
| Worker | BullMQ processors and schedulers | [`docs/en/integrations/queue/README.md`](./docs/en/integrations/queue/README.md) |

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm docker:db:up
pnpm db:push
pnpm db:seed
pnpm dev:all
```

Split services when debugging service-specific behavior:

```bash
pnpm dev
pnpm worker:dev
```

Start `pnpm api:dev` only when working on optional standalone Hono routes.

## Code Ownership Boundaries

Framework code should remain generic. Product behavior belongs in `src/modules/<name>/` unless an existing extension point is the correct owner.

| Area | Ownership |
| --- | --- |
| `apps/web`, `apps/desktop`, `apps/mobile` | Platform composition, UI, and adapters |
| `packages/contracts`, `packages/api-client` | Neutral wire schemas and client operations |
| `services/api`, `services/worker` | Backend process launchers; legacy source paths forward here |
| `src/server/auth` | Framework auth |
| `src/server/billing`, `src/server/order`, `src/server/membership` | Framework commerce |
| `src/server/features` | Built-in reusable features |
| `src/server/modules` | Pluggable event-driven modules |
| `src/modules/<name>` | Product-specific modules |
| `src/workers` | Queue and processor runtime |
| `src/api` | Optional standalone Hono API runtime |

## Product Implementation Flow

1. Phase 0 design: [`docs/en/ai/design.md`](./docs/en/ai/design.md).
2. New module creation: [`docs/en/ai/new-module.md`](./docs/en/ai/new-module.md).
3. API rules: [`docs/en/conventions/api.md`](./docs/en/conventions/api.md).
4. Integration-specific rules: [`docs/en/integrations/README.md`](./docs/en/integrations/README.md).
5. Built-in features: [`docs/en/features/README.md`](./docs/en/features/README.md).
6. Testing: [`docs/en/ai/testing.md`](./docs/en/ai/testing.md).
7. Completion checks: [`docs/en/ai/completion-checklist.md`](./docs/en/ai/completion-checklist.md).

## Database Changes

- Product entities may be added to `prisma/schema.prisma`.
- Do not modify framework-reserved tables unless explicitly requested.
- Local experiments may use `pnpm db:push`.
- Deployable committed changes require Prisma migrations.
- Required fields need a safe migration path for existing data.

See [`docs/en/integrations/database/README.md`](./docs/en/integrations/database/README.md).

## Pluggable Modules

Pluggable modules subscribe to domain events and should not be called directly from core flows.

Core flow:

```text
business service -> appEvents.emit() -> pluggable modules -> providers / side effects
```

Rules:

- Module enablement belongs in `src/config/modules.ts`.
- Pluggable modules implement `FrameworkModule`.
- Disabled modules must not expose routers or webhook endpoints.
- Modules communicate through events, not direct imports between product modules.

## Production Readiness

Before deploying:

- Configure auth, database, Redis, and required provider keys.
- Confirm `SERVICE_MODE` deployment shape. The default is `web,worker`; enable API only for real Hono routes.
- Run quality checks.
- Confirm migrations.
- Verify webhooks, queues, and idempotency for payment or worker changes.

See [`docs/en/deployment/cloud-deploy.md`](./docs/en/deployment/cloud-deploy.md) and [`docs/en/ai/completion-checklist.md`](./docs/en/ai/completion-checklist.md).
