<p align="center">
  <img src="public/banner.gif" alt="Velobase Harness — open-source AI SaaS boilerplate with built-in ad attribution, affiliate engine, and usage-based billing" />
</p>

<p align="center">
  <strong>An open-source framework that takes your AI app from code to cash.</strong>
</p>

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61dafb" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript" /></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-10-f69220" alt="pnpm" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
</p>

<p align="center">
  <a href="https://x.com/VelobaseX"><img src="https://img.shields.io/badge/Follow_on_X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" /></a>&nbsp;&nbsp;
  <a href="https://discord.gg/UnzEZJRnUf"><img src="https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord" /></a>
</p>

<p align="center">
  Help us reach more developers — <a href="https://github.com/velobase/velobase-harness"><strong>Star this repo!</strong></a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> · <a href="#quick-start">Quick Start</a> · <a href="#documentation">Docs</a> · <a href="#architecture">Architecture</a>
</p>

---

### Ship fast. Get paid faster.

In the vibe-coding era, everyone can build. But almost none of them make a dollar from it.

We went from the same problem to 8-figure ARR. The secret was not a better product — it was the growth and monetization infrastructure behind it. We just open-sourced all of it. That is Velobase Harness.

<!-- TODO: Replace with product screenshot or demo GIF -->
<!-- <p align="center">
  <img src="public/demo.gif" alt="Harness Demo" width="720" />
</p> -->

## Why Velobase Harness

An open-source AI SaaS framework, extracted from a product doing 8-figure ARR. Unlike every other boilerplate, it does not stop at shipping — it covers the full path from build to revenue.

**📡 Ad Attribution** — Server-side tracking that tells you which ads actually convert. Google Ads offline conversion upload, X pixel, PropellerAds.

**🤝 Affiliate Engine** — Financial-grade double-entry ledger, refund clawback, USDT cashout. Your users become your salesforce.

**💳 Usage-Based Billing** — Full credits lifecycle, subscriptions, multi-currency, metering dashboard, and `@velobaseai/billing` integration. Charges from day one.

**🛡️ Anti-Abuse Guardrails** — Redis rate limits, Turnstile, disposable email and Gmail trick checks, signup IP/device signals, guest chat quotas, and credit clawback to reduce free-credit and model-cost abuse.

**📧 Email Outreach** — A/B testing, scheduled campaigns, dual-provider failover. Brings people back automatically.

**Plus:** Auth & anti-abuse · Multi-LLM AI chat · 11 BullMQ background workers · Stripe & crypto payments · PostHog analytics · Affiliate/Referral · Promo codes · Admin dashboard · Pluggable modules (toggle via env vars) · Docker, Kubernetes & GitOps docs

> We checked every boilerplate on the market. They help you build. **We help you build AND make money.**

## Quick Start

### Option A: Velobase Launchpad

The fastest path — describe your product, Launchpad creates the repo, provisions all Cloud resources, and generates an AI IDE prompt so you can start building immediately.

👉 **[Launch on Velobase Cloud](https://velobase.cloud/launchpad)**

### Option B: Local Development

Prerequisites: Node.js, pnpm, Docker Desktop, and Docker Compose.

```bash
pnpm install
cp .env.example .env
pnpm docker:db:up
pnpm db:push
pnpm db:seed
pnpm dev:all
```

`pnpm docker:db:up` starts the local infrastructure from `docker-compose.yml`:

| Service | Image | Local URL / Port | Used by |
| --- | --- | --- | --- |
| PostgreSQL | `postgres:16` | `localhost:5432` | Prisma, auth, billing, product data |
| Redis | `redis:7` | `localhost:6379` | BullMQ workers, queues, rate limits |

The default `.env.example` already points to these local services:

```env
DATABASE_URL=postgresql://velobase:velobase@localhost:5432/velobase
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

`pnpm dev:all` starts the default combined local runtime: Web on `:3000` and Worker on `:3001`. The optional Hono API service is disabled by default; run `SERVICE_MODE=all pnpm dev:all` or `pnpm api:dev` when you need it.

Open the app at [http://localhost:3000](http://localhost:3000).

You can also split processes across terminals:

```bash
pnpm dev
pnpm worker:dev
```

Add `pnpm api:dev` only when you are actively developing standalone Hono routes.

When you are ready to deploy, see the [Cloud Deployment Guide](./docs/en/deployment/cloud-deploy.md).

If you are not entering through Launchpad flow, run Step 0 in [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) before implementing product features: complete domain design, output the MVP scope and feature list, and wait for user confirmation before coding.

## Architecture

```mermaid
flowchart TB
  browser[Browser] --> nextApp[Next.js Web]
  nextApp --> trpc[tRPC Routers]
  external[External Integrations] --> nextRoutes[Next Route Handlers]
  nextRoutes --> services
  trpc --> services[Domain Services]
  services --> db[(PostgreSQL)]
  services --> redis[(Redis)]
  services --> events[Event Bus]
  events --> modules[Pluggable Modules]
  worker[BullMQ Worker] --> redis
  worker --> services
  modules --> growth[Growth Operations]
  hono[Optional Hono API] -. enable when needed .-> services
```

The same codebase can run as one process or as separate services:

| Runtime | Entry | Port | Command |
| --- | --- | --- | --- |
| Web | Next.js App Router | `3000` | `pnpm dev` / `pnpm start` |
| Worker | BullMQ processors | `3001` | `pnpm worker:dev` / `pnpm worker:prod` |
| Combined default | `src/server/standalone.ts` | `3000`, `3001` | `pnpm dev:all` / `pnpm start:all` |
| Optional API | Hono HTTP service | `3002` | `pnpm api:dev` / `pnpm api:prod` |

`SERVICE_MODE` defaults to `web,worker`. It also supports `all`, `web`, `api`, `worker`, and combinations such as `web,api`. See [Web/API/Worker split](./docs/en/architecture/web-api-service-split.md) before enabling API in production.

## From Template to Cloud

```mermaid
flowchart LR
  idea[Product Idea] --> launchpad[Velobase Launchpad]
  launchpad --> repo[GitHub Repo from Harness]
  launchpad --> cloud[Velobase Cloud Resources]
  repo --> ide[IDE Agent Development]
  ide --> push[Git Push]
  push --> actions[GitHub Actions]
  actions --> deployApi[Velobase Deploy API]
  deployApi --> liveApp[Live SaaS App]
```

Launchpad generates an IDE prompt that tells the AI agent how to use the Harness docs, where to implement product features, how to keep framework boundaries intact, and how to push changes back for Cloud deployment.

## Documentation

| Area | English | Chinese |
| --- | --- | --- |
| Documentation hub | [docs/en/README.md](./docs/en/README.md) | [docs/zh-CN/README.md](./docs/zh-CN/README.md) |
| Framework guide | [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) | [FRAMEWORK_GUIDE.zh-CN.md](./FRAMEWORK_GUIDE.zh-CN.md) |
| Integration guide | [docs/en/integrations/README.md](./docs/en/integrations/README.md) | [docs/zh-CN/integrations/README.md](./docs/zh-CN/integrations/README.md) |
| Product modules | [docs/en/modules/README.md](./docs/en/modules/README.md) | [docs/zh-CN/modules/README.md](./docs/zh-CN/modules/README.md) |
| AI Chat module | [docs/en/modules/ai-chat/README.md](./docs/en/modules/ai-chat/README.md) | [docs/zh-CN/modules/ai-chat/README.md](./docs/zh-CN/modules/ai-chat/README.md) |
| AI task guides | [docs/en/ai/](./docs/en/ai/) | [docs/zh-CN/ai/](./docs/zh-CN/ai/) |
| AI completion checklist | [docs/en/ai/completion-checklist.md](./docs/en/ai/completion-checklist.md) | [docs/zh-CN/ai/completion-checklist.md](./docs/zh-CN/ai/completion-checklist.md) |
| Web/API/Worker split | [docs/en/architecture/web-api-service-split.md](./docs/en/architecture/web-api-service-split.md) | [docs/zh-CN/architecture/web-api-service-split.md](./docs/zh-CN/architecture/web-api-service-split.md) |
| AI agent rules | [AGENTS.md](./AGENTS.md) | [AGENTS.zh-CN.md](./AGENTS.zh-CN.md) |

Legacy non-locale paths under `docs/` are compatibility shims. New documentation should use `docs/en/**` and `docs/zh-CN/**`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=velobase/velobase-harness&type=Date)](https://star-history.com/#velobase/velobase-harness&Date)

## Project Structure

```text
src/
├── app/              # Next.js pages and API routes
├── api/              # Optional standalone Hono API entry
├── config/           # Module configuration
├── modules/          # Product modules and templates
├── server/           # Auth, billing, order, events, modules, features
├── workers/          # BullMQ queues and processors
├── components/       # Shared UI components
└── analytics/        # PostHog and ads event tracking
```

## Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm check
pnpm format:check
pnpm build
```

`package.json` does not define a general unit-test script in this template. Service-mode smoke coverage lives in `docker-compose.test.yml` and `scripts/test-service-mode.mjs`.

## Contributing

We'd love for you to help shape what's coming next — whether it's fixing bugs, building new features, or improving docs.

- 📘 Check out our [Contribution Guide](CONTRIBUTING.md) to get started
- 💻 Submit ideas, issues, or PRs on [GitHub](https://github.com/velobase/velobase-harness)
- 💬 Join the conversation in our [Discord](https://discord.gg/UnzEZJRnUf) — it's where the community lives

## License

[MIT](LICENSE) — use it, fork it, ship it, make money with it.
