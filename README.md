# AI SaaS Framework

A production-ready, full-stack AI SaaS framework built with the T3 Stack. Designed for solo developers who want to ship AI products fast without rebuilding common infrastructure.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **API**: tRPC v11 (end-to-end type safety)
- **Database**: PostgreSQL + Prisma 6 ORM + Redis
- **Auth**: NextAuth v5 (Google, GitHub, Email Magic Link)
- **Styling**: Tailwind CSS v4 + Radix UI (shadcn/ui)
- **Background Jobs**: BullMQ + Redis
- **AI**: Vercel AI SDK (OpenAI, Anthropic, Google Gemini, xAI, OpenRouter)
- **Payments**: Stripe + NowPayments (crypto)

## Quick Start

```bash
pnpm install                # Install dependencies
cp .env.example .env        # Copy and configure environment variables
docker compose up -d        # Start PostgreSQL + Redis
pnpm db:migrate             # Run database migration
pnpm dev                    # Web server → http://localhost:3000
pnpm worker:dev             # Worker server → http://localhost:3001
```

See [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) for detailed setup and production deployment checklist.

## Documentation

| Document | Description |
| --- | --- |
| [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) | Architecture, quick start, module system, code boundaries, production checklist |
| [AGENTS.md](./AGENTS.md) | AI coding rules and constraints |
| [docs/conventions/api.md](./docs/conventions/api.md) | API three-zone system and coding conventions |
| [docs/integration-guide.md](./docs/integration-guide.md) | Third-party integration roadmap and 6-step process |
| [docs/integrations/](./docs/integrations/) | Detailed docs per integration (auth, email, database, payment, storage, queue, security) |
| [docs/features/](./docs/features/) | Built-in framework features (daily-bonus, anti-abuse, cdn-adapters) |

## Project Structure

```
src/
├── app/              # Next.js pages and API routes
├── config/           # Module configuration (modules.ts)
├── modules/          # Business modules (see modules/example/ for template)
├── server/           # Server-side code
│   ├── api/          # tRPC routers (root.ts — core + conditional mounting)
│   ├── auth/         # Authentication
│   ├── billing/      # Credits and billing (Velobase SDK)
│   ├── order/        # Orders and payment processing
│   ├── email/        # Unified email service (Resend / SendGrid)
│   ├── events/       # Event bus (bus.ts — module decoupling)
│   ├── modules/      # Pluggable modules (registry + implementations)
│   ├── features/     # Built-in features (anti-abuse, cdn-adapters, daily-bonus)
│   └── ...
├── workers/          # BullMQ workers, queues, and processors
├── components/       # Shared UI components
└── analytics/        # PostHog event tracking
```

## Pluggable Module System

Third-party integrations and non-core features are implemented as **pluggable modules**. Each module is auto-enabled when its required environment variables are configured, and can be force-disabled via `DISABLE_*` flags.

| Module | Auto-enabled when | Force-disable |
| --- | --- | --- |
| Google Ads | `GOOGLE_ADS_CUSTOMER_ID` + `GOOGLE_ADS_DEVELOPER_TOKEN` | `DISABLE_GOOGLE_ADS=true` |
| PostHog | `POSTHOG_API_KEY` | `DISABLE_POSTHOG=true` |
| Lark/Feishu | `LARK_APP_ID` + `LARK_APP_SECRET` | `DISABLE_LARK=true` |
| Telegram | `TELEGRAM_BOT_TOKEN` | `DISABLE_TELEGRAM=true` |
| NowPayments | `NOWPAYMENTS_API_KEY` | `DISABLE_NOWPAYMENTS=true` |
| Affiliate | Default on | `DISABLE_AFFILIATE=true` |
| Touch | Default on | `DISABLE_TOUCH=true` |
| AI Chat | Any LLM API key | `DISABLE_AI_CHAT=true` |

Core business logic emits events (e.g. `payment:succeeded`) via the **Event Bus** (`src/server/events/bus.ts`), and modules subscribe to these events for side effects — no direct coupling. See [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md#5-可插拔模块架构) for details.

## Adding a New Feature

See `src/modules/example/` for a complete template, or read [docs/conventions/api.md](./docs/conventions/api.md) for coding conventions.

```bash
# 1. Create module
mkdir -p src/modules/my-feature/server

# 2. Add service + router
# 3. Register router in src/server/api/root.ts
# 4. Add Prisma models if needed
npx prisma db push
```

To create a **pluggable module** (optional integration that can be enabled/disabled):

1. Add config switch in `src/config/modules.ts`
2. Create `src/server/modules/<name>.ts` implementing `FrameworkModule`
3. Register in `src/server/modules/index.ts`
4. See [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md#创建新模块) for details

## Environment Variables

See `.env.example` for the full list with comments. Key variables:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ and caching |
| `NEXTAUTH_SECRET` | NextAuth secret (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `RESEND_API_KEY` | Email sending |

## License

Private — All rights reserved.
