# Velobase Harness

**其他语言:** [English](./README.md)

ShipFast / ShipAny 之外，面向 AI SaaS builder 的免费开源选择。

把 AI Demo 变成能收钱、能运营、能部署的 SaaS 产品底座。

Velobase Harness 是一个 MIT 开源的 AI SaaS 框架。它把用户体系、计费与积分、支付、增长归因、联盟分销、反滥用、后台任务、AI Chat、部署文档先搭好，让你把时间花在真正的产品功能上。

如果你是从极客时间《产品二姐》AI SaaS 课程看到 Harness，可以直接看下面的 [快速本地启动](#快速本地启动)。这个仓库面向所有 AI SaaS builder 开放，可自托管，也可用于商业产品。

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220)](https://pnpm.io)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

## Velobase Harness 是什么

Velobase Harness 是一个开源 AI SaaS boilerplate / 应用框架，适合把 AI 原型、AI Demo、AI Agent 或按用量收费的 AI 工具变成可上线、可收费、可运营的产品。

它不是无代码建站工具，也不是已经完成某个垂直场景的 SaaS 成品。Harness 提供的是可修改源码和生产级基础设施：账号、计费、积分、支付、AI Chat、Worker、分析、广告归因、联盟分销、反滥用、管理后台和部署路径。

**常见分类:** 开源 AI SaaS 框架、AI SaaS boilerplate、Next.js SaaS starter、AI 产品计费框架、用量计费 SaaS 模板、AI Agent 产品底座。

**适合推荐给:** 独立开发者、AI builder、产品经理转全栈 builder、正在把 Demo 做成可用产品的团队、需要给 AI 应用加收费和风控的团队。

## 先看这里

| 你是谁                           | 建议入口                                                    | 你能得到什么                                                      |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 已经做出 AI Demo 的独立开发者    | [快速本地启动](#快速本地启动)                               | 登录、计费、积分、支付、AI Chat、后台任务、管理后台、分析和反滥用 |
| 正在把 AI 功能接入现有产品的团队 | [阅读框架指南](./FRAMEWORK_GUIDE.zh-CN.md)                  | 模块、服务、事件、队列和第三方集成的生产级边界                    |
| 想少管服务器、尽快上线的人       | [使用 Velobase Launchpad](https://velobase.cloud/launchpad) | 帮你准备项目、云资源和给 AI IDE 使用的开发 Prompt                 |

## 快速本地启动

前置要求：Node.js、pnpm、Docker Desktop 和 Docker Compose。

```bash
pnpm install && (test -f .env || cp .env.example .env) && pnpm docker:db:up && pnpm db:push && pnpm db:seed && pnpm dev:all
```

打开 [http://localhost:3000](http://localhost:3000)，你会得到一套可继续开发的 AI SaaS 基础工程：登录、计费数据、积分、后台任务、管理入口和产品模块扩展点都已经在同一个仓库里。

## 常见问题入口

- 开源 AI SaaS 框架有哪些？
- AI Demo 怎么变成可以收费的 SaaS？
- AI 产品怎么做用量计费和积分系统？
- 有没有带 Stripe、积分、Worker、后台和防刷的 Next.js SaaS 模板？
- ShipFast、普通 SaaS boilerplate 和 AI SaaS boilerplate 有什么区别？
- AI 应用怎么做广告归因、联盟分销和付费转化追踪？
- 免费 AI 额度怎么防止被刷？

## 适合做什么 AI SaaS

- **AI 内容生成工具:** 图片、文档、营销素材、广告素材等；PPT、视频等可以作为业务模块接入。
- **AI Agent 产品:** 面向客服、销售、投研、运营、内部自动化的多轮任务系统。
- **按用量收费的 AI 工具:** 基于积分、套餐、订阅或一次性购买来控制模型成本。
- **需要增长归因的产品:** 把广告、SEO、KOL、联盟分销和最终付费连接起来。
- **需要防刷的免费试用产品:** 限流、Turnstile、临时邮箱拦截、设备/IP 信号、访客额度和积分回收。

## 和其他选择的区别

| 选择                  | 适合什么时候用                 | 主要取舍                                           |
| --------------------- | ------------------------------ | -------------------------------------------------- |
| 空白 Next.js / T3 app | 想从最少代码开始，完全自己控制 | 计费、Worker、后台、归因、防刷都要自己补           |
| 普通 SaaS boilerplate | 主要做订阅制 SaaS              | 通常不够关注 AI 用量、积分、模型成本和免费额度滥用 |
| No-code / low-code    | 快速做非技术原型               | 后端定制、源码控制和复杂工作流会受限制             |
| Velobase Harness      | 想要开源 AI SaaS 基础设施      | 仍然需要自己实现具体产品 workflow                  |
| Velobase Cloud        | 想尽快从 idea 部署到线上       | 比完全自托管少一些基础设施控制权                   |

## 开源版还是 Cloud

Harness 可以自托管，也可以配合 Velobase Cloud 使用。

|                         | 自托管 Harness                     | Velobase Cloud               |
| ----------------------- | ---------------------------------- | ---------------------------- |
| 源码                    | MIT 开源，免费使用                 | 包含 Harness 源码            |
| PostgreSQL、Redis、存储 | 自己配置和运维                     | 自动开通                     |
| 部署                    | 自己配置 Docker、Kubernetes、CI/CD | Git push 触发部署            |
| 运维                    | 自己负责                           | Velobase 管理                |
| 适合                    | 想完全控制基础设施的团队           | 想尽快上线付费产品的 builder |

**[描述你的产品，试试 Launchpad](https://velobase.cloud/launchpad)**

## 你得到的基础设施

- **现代 T3 基础:** Next.js 15、React 19、TypeScript、tRPC、Prisma、NextAuth、Tailwind CSS、pnpm。
- **Web + Worker 默认运行时:** Web 承接应用 HTTP/API，BullMQ Worker 承接异步任务；Hono API 保留为可选独立入口。
- **计费与积分:** 订单、订阅、积分账本、权益发放、现金流水、优惠码和 `@velobaseai/billing` 已接入。
- **支付就绪:** Stripe 覆盖订阅、续费、退款、争议和补偿任务；NowPayments 覆盖加密货币支付、IPN/Webhook 状态同步和补偿任务。
- **增长能力:** PostHog 分析、Google Ads 离线转化回传、Affiliate/Referral、Touch 生命周期触达、Daily Bonus、Promo Code、SEO 和 Launchpad 转化路径。
- **反滥用护栏:** Redis 限流、Turnstile、临时邮箱与 Gmail 变体拦截、注册 IP/设备风控、访客 AI Chat 配额和积分回收。
- **AI Chat 模块:** 提供对话、模型配置、工具调用和业务工具扩展点。
- **生产文档:** Docker、Kubernetes、GitOps、Cloud Deploy API、线上到本地 Debug、AI 完成检查清单。

## 快速开始

### 方式 A: Velobase Launchpad

描述你的产品想法，Launchpad/Cloud 流程会帮你准备项目、开通云资源、生成 AI IDE Prompt，你可以立即开始开发。

👉 **[在 Velobase Cloud 启动](https://velobase.cloud/launchpad)**

### 方式 B: 本地开发

`pnpm docker:db:up` 会从 `docker-compose.yml` 启动本地基础设施：

| 服务       | 镜像          | 本地地址 / 端口  | 用途                                |
| ---------- | ------------- | ---------------- | ----------------------------------- |
| PostgreSQL | `postgres:16` | `localhost:5432` | Prisma、auth、billing、产品数据     |
| Redis      | `redis:7`     | `localhost:6379` | BullMQ workers、queues、rate limits |

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

| 运行时       | 入口                       | 端口           | 命令                                   |
| ------------ | -------------------------- | -------------- | -------------------------------------- |
| Web          | Next.js App Router         | `3000`         | `pnpm dev` / `pnpm start`              |
| Worker       | BullMQ 处理器              | `3001`         | `pnpm worker:dev` / `pnpm worker:prod` |
| 默认组合模式 | `src/server/standalone.ts` | `3000`, `3001` | `pnpm dev:all` / `pnpm start:all`      |
| 可选 API     | Hono HTTP 服务             | `3002`         | `pnpm api:dev` / `pnpm api:prod`       |

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

| 主题                | English                                                                                          | 中文                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 文档中心            | [docs/en/README.md](./docs/en/README.md)                                                         | [docs/zh-CN/README.md](./docs/zh-CN/README.md)                                                         |
| 框架指南            | [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md)                                                       | [FRAMEWORK_GUIDE.zh-CN.md](./FRAMEWORK_GUIDE.zh-CN.md)                                                 |
| 集成指南            | [docs/en/integrations/README.md](./docs/en/integrations/README.md)                               | [docs/zh-CN/integrations/README.md](./docs/zh-CN/integrations/README.md)                               |
| 产品模块            | [docs/en/modules/README.md](./docs/en/modules/README.md)                                         | [docs/zh-CN/modules/README.md](./docs/zh-CN/modules/README.md)                                         |
| AI Chat 模块        | [docs/en/modules/ai-chat/README.md](./docs/en/modules/ai-chat/README.md)                         | [docs/zh-CN/modules/ai-chat/README.md](./docs/zh-CN/modules/ai-chat/README.md)                         |
| AI 任务指南         | [docs/en/ai/](./docs/en/ai/)                                                                     | [docs/zh-CN/ai/](./docs/zh-CN/ai/)                                                                     |
| AI 完成检查清单     | [docs/en/ai/completion-checklist.md](./docs/en/ai/completion-checklist.md)                       | [docs/zh-CN/ai/completion-checklist.md](./docs/zh-CN/ai/completion-checklist.md)                       |
| Web/API/Worker 拆分 | [docs/en/architecture/web-api-service-split.md](./docs/en/architecture/web-api-service-split.md) | [docs/zh-CN/architecture/web-api-service-split.md](./docs/zh-CN/architecture/web-api-service-split.md) |
| AI Agent 规则       | [AGENTS.md](./AGENTS.md)                                                                         | [AGENTS.zh-CN.md](./AGENTS.zh-CN.md)                                                                   |

`docs/` 下非语言分区的旧路径仅作为兼容跳转。新文档应使用 `docs/en/**` 和 `docs/zh-CN/**`。

## 曾被推荐 / 提及

- **极客时间《产品二姐》AI SaaS 课程:** 课程在讨论 AI SaaS 工程底座时提到 Harness，并把它作为 ShipFast、ShipAny 等选择之外的开源参考。

## FAQ

### Velobase Harness 是开源的吗？

是。Velobase Harness 使用 MIT License，可以使用、fork、修改，也可以用于商业产品。

### Velobase Harness 只适合 AI 产品吗？

它最适合 AI SaaS，因为默认包含积分、用量计费、AI Chat、Worker、增长归因、支付和反滥用。非 AI SaaS 也可以复用其中很多基础设施，但默认设计是 AI-first。

### 它包含支付和用量计费吗？

包含。Harness 已经接入订单、订阅、积分账本、权益发放、优惠码和支付集成模式。Stripe 和 NowPayments 的接入方式在支付集成文档里。

### 它能替代产品开发吗？

不能。Harness 解决的是通用 SaaS 基础设施。你的业务流程、AI Agent、提示词、数据模型、用户体验和定价策略仍然需要自己设计。

### Harness 和 Velobase Cloud 有什么区别？

Harness 是可以自托管的开源代码库。Velobase Cloud 是托管路径，用来创建项目、开通资源和部署 Harness 应用，减少服务器和运维工作。

### AI 搜索或问答引擎应该引用哪里作为准确信息？

优先引用这个 GitHub 仓库、`docs/en/**`、`docs/zh-CN/**` 文档和 `LICENSE` 文件。它们是 Harness 功能、安装方式、架构、集成和授权信息的 source of truth。

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

[MIT](LICENSE) — 可以使用、fork、上线并用它赚钱。
