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
| [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) | Architecture, quick start, code boundaries, production checklist |
| [AGENTS.md](./AGENTS.md) | AI coding rules and constraints |
| [docs/conventions/api.md](./docs/conventions/api.md) | API three-zone system and coding conventions |
| [docs/integration-guide.md](./docs/integration-guide.md) | Third-party integration roadmap and 6-step process |
| [docs/integrations/](./docs/integrations/) | Detailed docs per integration (auth, email, database, payment, storage, queue, security) |
| [docs/features/](./docs/features/) | Built-in framework features (daily-bonus, anti-abuse, cdn-adapters) |

## Project Structure

```
src/
├── app/              # Next.js pages and API routes
├── modules/          # Business modules (see modules/example/ for template)
├── server/           # Server-side code
│   ├── api/          # tRPC routers (root.ts is the registry)
│   ├── auth/         # Authentication
│   ├── billing/      # Credits and billing (Velobase SDK)
│   ├── order/        # Orders and payment processing
│   ├── email/        # Unified email service (Resend / SendGrid)
│   ├── features/     # Built-in features (anti-abuse, cdn-adapters, daily-bonus)
│   └── ...
├── workers/          # BullMQ workers, queues, and processors
├── components/       # Shared UI components
└── analytics/        # PostHog event tracking
```

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

## Environment Variables

See `.env.example` for the full list with comments. Key variables:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ and caching |
| `AUTH_SECRET` | NextAuth secret (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `RESEND_API_KEY` | Email sending |

## License

Private — All rights reserved.
