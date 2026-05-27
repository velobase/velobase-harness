# Velobase Harness

**其他语言:** [English](./README.md)

Velobase Harness 是面向 AI SaaS 的应用框架：T3 Stack 基础、计费与积分、支付、后台任务、增长集成，以及和 Velobase Cloud / Launchpad 打通的部署路径。

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220)](https://pnpm.io)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#license)

## 为什么是 Velobase Harness

Velobase Harness 不是空白脚手架，而是一套能直接承接 AI SaaS 产品开发的应用底座。它尽量把通用基础设施、计费、支付、队列、增长和部署路径先解决，让 AI 和开发者把精力放在产品差异化功能上。

- **现代 T3 基础:** Next.js 16、React 19、TypeScript、tRPC、Prisma、NextAuth、Tailwind CSS、pnpm。
- **Web + Worker 默认运行时:** Web 承接应用 HTTP/API，BullMQ Worker 承接异步任务；Hono API 保留为可选独立入口。
- **可插拔模块:** Google Ads、PostHog、Lark、Telegram、NowPayments、Affiliate、Touch、AI Chat 可按环境变量启停。
- **计费与积分:** 订单、订阅、积分账本、权益发放、现金流水、优惠码和 `@velobaseai/billing` 已接入。
- **支付就绪:** Stripe 与 NowPayments 覆盖 Webhook、续费、退款、争议和补偿任务。
- **反滥用护栏:** Redis 限流、Turnstile、临时邮箱与 Gmail 变体拦截、注册 IP/设备风控、访客 AI Chat 配额和积分回收，降低刷号、薅赠送额度和刷模型成本的风险。
- **AI Chat 模块:** 提供对话、模型配置、工具调用和业务工具扩展点。
- **Worker 队列:** BullMQ 处理支付对账、订单补偿、用户触达、订阅积分、客服同步和广告回传。
- **运营增长能力:** PostHog 分析、Google Ads 离线转化回传、Affiliate/Referral、Touch 生命周期触达、Daily Bonus 留存、Promo Code、SEO 和 Launchpad 转化路径。
- **生产文档:** Docker、Kubernetes、GitOps、Cloud Deploy API、线上到本地 Debug、AI 完成检查清单。

## 快速开始

### 方式 A: Velobase Launchpad

最快的路径 — 描述你的产品想法，Launchpad 自动创建仓库、开通全部云资源、生成 AI IDE Prompt，你可以立即开始开发。

👉 **[在 Velobase Cloud 启动](https://velobase.cloud/launchpad)**

### 方式 B: 本地开发

前置要求：Node.js、pnpm、Docker Desktop 和 Docker Compose。

```bash
pnpm install
cp .env.example .env
pnpm docker:db:up
pnpm db:push
pnpm db:seed
pnpm dev:all
```

`pnpm docker:db:up` 会从 `docker-compose.yml` 启动本地基础设施：

| 服务 | 镜像 | 本地地址 / 端口 | 用途 |
| --- | --- | --- | --- |
| PostgreSQL | `postgres:16` | `localhost:5432` | Prisma、auth、billing、产品数据 |
| Redis | `redis:7` | `localhost:6379` | BullMQ workers、queues、rate limits |

默认 `.env.example` 已经指向这些本地服务：

```env
DATABASE_URL=postgresql://velobase:velobase@localhost:5432/velobase
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

`pnpm dev:all` 会启动默认本地组合运行时：Web `:3000` 和 Worker `:3001`。可选 Hono API 默认不启用；需要时使用 `SERVICE_MODE=all pnpm dev:all` 或 `pnpm api:dev`。

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

也可以拆分到多个终端启动：

```bash
pnpm dev
pnpm worker:dev
```

只有在开发独立 Hono routes 时才额外启动 `pnpm api:dev`。

准备好部署时，查看 [Cloud 部署指南](./docs/zh-CN/deployment/cloud-deploy.md)。

如果不是从 Launchpad flow 进入，开始实现产品功能前先执行 [FRAMEWORK_GUIDE.zh-CN.md](./FRAMEWORK_GUIDE.zh-CN.md) 的 Step 0：完成领域设计，输出 MVP scope 和功能列表，并等待用户确认后再写代码。

## 架构

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

同一套代码可以单进程运行，也可以拆分为独立服务：

| 运行时 | 入口 | 端口 | 命令 |
| --- | --- | --- | --- |
| Web | Next.js App Router | `3000` | `pnpm dev` / `pnpm start` |
| Worker | BullMQ 处理器 | `3001` | `pnpm worker:dev` / `pnpm worker:prod` |
| 默认组合模式 | `src/server/standalone.ts` | `3000`, `3001` | `pnpm dev:all` / `pnpm start:all` |
| 可选 API | Hono HTTP 服务 | `3002` | `pnpm api:dev` / `pnpm api:prod` |

`SERVICE_MODE` 默认是 `web,worker`。它也支持 `all`、`web`、`api`、`worker`，以及 `web,api` 等组合。生产启用 API 前先阅读 [Web/API/Worker 拆分](./docs/zh-CN/architecture/web-api-service-split.md)。

## 从模板到云服务

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

Launchpad 会生成一段 IDE Prompt，引导 AI Agent 阅读 Harness 文档、理解框架边界、实现产品功能，并在完成后 push 触发 Cloud 部署。

## 文档

| 主题 | English | 中文 |
| --- | --- | --- |
| 文档中心 | [docs/en/README.md](./docs/en/README.md) | [docs/zh-CN/README.md](./docs/zh-CN/README.md) |
| 框架指南 | [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) | [FRAMEWORK_GUIDE.zh-CN.md](./FRAMEWORK_GUIDE.zh-CN.md) |
| 集成指南 | [docs/en/integrations/README.md](./docs/en/integrations/README.md) | [docs/zh-CN/integrations/README.md](./docs/zh-CN/integrations/README.md) |
| 产品模块 | [docs/en/modules/README.md](./docs/en/modules/README.md) | [docs/zh-CN/modules/README.md](./docs/zh-CN/modules/README.md) |
| AI Chat 模块 | [docs/en/modules/ai-chat/README.md](./docs/en/modules/ai-chat/README.md) | [docs/zh-CN/modules/ai-chat/README.md](./docs/zh-CN/modules/ai-chat/README.md) |
| AI 任务指南 | [docs/en/ai/](./docs/en/ai/) | [docs/zh-CN/ai/](./docs/zh-CN/ai/) |
| AI 完成检查清单 | [docs/en/ai/completion-checklist.md](./docs/en/ai/completion-checklist.md) | [docs/zh-CN/ai/completion-checklist.md](./docs/zh-CN/ai/completion-checklist.md) |
| Web/API/Worker 拆分 | [docs/en/architecture/web-api-service-split.md](./docs/en/architecture/web-api-service-split.md) | [docs/zh-CN/architecture/web-api-service-split.md](./docs/zh-CN/architecture/web-api-service-split.md) |
| AI Agent 规则 | [AGENTS.md](./AGENTS.md) | [AGENTS.zh-CN.md](./AGENTS.zh-CN.md) |

`docs/` 下非语言分区的旧路径仅作为兼容跳转。新文档应使用 `docs/en/**` 和 `docs/zh-CN/**`。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=velobase/velobase-harness&type=Date)](https://star-history.com/#velobase/velobase-harness&Date)

## 项目结构

```text
src/
├── app/              # Next.js 页面和 API routes
├── api/              # 可选独立 Hono API 入口
├── config/           # 模块配置
├── modules/          # 产品模块和示例模板
├── server/           # Auth、billing、order、events、modules、features
├── workers/          # BullMQ 队列和处理器
├── components/       # 共享 UI 组件
└── analytics/        # PostHog 和广告事件追踪
```

## 质量命令

```bash
pnpm lint
pnpm typecheck
pnpm check
pnpm format:check
pnpm build
```

当前模板的 `package.json` 没有统一单元测试脚本。服务模式冒烟验证在 `docker-compose.test.yml` 和 `scripts/test-service-mode.mjs` 中。

## License

Private - All rights reserved.
