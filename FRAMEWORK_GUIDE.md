# AI SaaS Framework — 开发指南

本文档指导基于本框架开发新的 AI SaaS 产品。涵盖架构概览、快速启动、代码边界划分和分阶段 Checklist。

> **定位**：本文件面向开发者，说明"框架是什么、怎么用、从模板到产品的路径"。  
> AI 编码规则（禁止/必须） → 见 `[AGENTS.md](./AGENTS.md)`  
> API 三区制与编码约定 → 见 `[docs/conventions/api.md](./docs/conventions/api.md)`  
> 第三方集成详细文档 → 见 `[docs/integrations/](./docs/integrations/)`  
> 集成梳理流程和进度 → 见 `[docs/integration-guide.md](./docs/integration-guide.md)`  
> 框架内置功能 → 见 `[docs/features/](./docs/features/)`

---

## 目录

1. [框架架构概览](#1-框架架构概览)
2. [最小配置快速启动](#2-最小配置快速启动)
3. [框架 vs 业务 — 代码边界清单](#3-框架-vs-业务--代码边界清单)
4. [从框架到生产应用 — 分阶段 Checklist](#4-从框架到生产应用--分阶段-checklist)
5. [可插拔模块架构](#5-可插拔模块架构)
6. [关键架构决策说明](#6-关键架构决策说明)

---

## 1. 框架架构概览

### 技术栈


| 层级      | 技术                                 |
| ------- | ---------------------------------- |
| 前端框架    | Next.js 15 (App Router) + React 19 |
| API 层   | tRPC 11（类型安全的端到端 API）              |
| 数据库 ORM | Prisma 6 + PostgreSQL              |
| 缓存 / 队列 | Redis + BullMQ                     |
| 认证      | NextAuth v5（支持 OAuth + 邮箱）         |
| 样式      | Tailwind CSS v4                    |
| 包管理     | pnpm                               |


### 分层架构

```mermaid
graph TB
  subgraph client [客户端层]
    pages[Next.js 页面 / App Router]
    ui[UI 组件库]
    trpcClient[tRPC 客户端]
  end

  subgraph api [API 层]
    trpcServer[tRPC Server / Routers]
    webhooks[Webhook 处理器]
    authApi[NextAuth 端点]
  end

  subgraph infra [基础设施层 — 框架提供，一般不动]
    authCore[认证系统 NextAuth]
    db[Prisma + PostgreSQL]
    redis[Redis 客户端]
    queue[BullMQ 队列]
    storage[对象存储抽象]
    email[邮件服务抽象]
    ratelimit[限流]
    adminFrame[Admin 框架]
    eventBus[事件总线 EventBus]
    moduleRegistry[模块注册表 Registry]
  end

  subgraph business [业务层 — 按产品定制]
    product[产品 / 定价定义]
    aiFeature[核心 AI 功能模块]
    billing[计费与积分]
    payment[支付渠道集成]
  end

  subgraph pluggable [可插拔模块层 — 按需启停]
    modLark[Lark 通知]
    modTelegram[Telegram Stars]
    modAds[Google Ads]
    modPosthog[PostHog 分析]
    modAffiliate[联盟推广]
    modTouch[用户触达]
    modAiChat[AI Chat]
    modNowpay[NowPayments]
  end

  subgraph workers [Worker 进程 — 独立部署]
    jobProcessors[BullMQ Processors]
    scheduledJobs[定时任务]
  end

  client --> api
  api --> infra
  api --> business
  business --> infra
  business -- "emit 事件" --> eventBus
  eventBus -- "订阅" --> pluggable
  moduleRegistry -- "注册/加载" --> pluggable
  workers --> infra
  workers --> business
```



### 请求数据流

```mermaid
sequenceDiagram
  participant Browser
  participant NextJS
  participant tRPC
  participant Service
  participant DB
  participant Redis

  Browser->>NextJS: HTTP 请求
  NextJS->>tRPC: 路由到对应 procedure
  tRPC->>tRPC: 认证鉴权 + 限流检查
  tRPC->>Service: 调用业务 Service
  Service->>DB: Prisma 查询
  Service->>Redis: 缓存 / 队列操作
  Service-->>tRPC: 返回结果
  tRPC-->>Browser: 类型安全响应
```



---

## 2. 最小配置快速启动

### 必需环境变量

```bash
# 认证
NEXTAUTH_SECRET=     # 运行 `npx auth secret` 生成
AUTH_URL=http://localhost:3000

# 数据库
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/mydb

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# 至少配置一个 OAuth 登录方式
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

### 本地启动步骤

```bash
pnpm install                # 安装依赖
cp .env.example .env        # 复制模板，填入必需变量
docker compose up -d        # 启动 PostgreSQL + Redis
pnpm db:push                # 同步 schema，创建所有数据表
pnpm db:seed                # 写入种子数据（Agent、产品、测试账号）

# 方式 A：一键启动全部（推荐开发时使用）
pnpm dev:all                # Web :3000 + API :3002 + Worker :3001

# 方式 B：分别启动（各开一个终端）
pnpm dev                    # Web 主应用 http://localhost:3000
pnpm api:dev                # API 服务 http://localhost:3002
pnpm worker:dev             # Worker 服务 http://localhost:3001
```

**seed 写入的内容：**

- 系统 Agent（AI 助手、写作等默认 Agent）
- 产品 SKU（订阅档位 + 积分包）
- 密码登录测试账号（详见下方）
- 触达场景通知模板

**本地测试账号（密码登录）：**

白名单在 `src/server/auth/password-login-allowlist.ts`，默认包含：

| 邮箱 | 密码 | 说明 |
| --- | --- | --- |
| `testadmin@example.com` | `Testadmin2024!` | 测试用户（非管理员） |

设置管理员：在 `.env` 中配置 `ADMIN_EMAIL=your@email.com`，重跑 `pnpm db:seed` 即可。

> 详细说明见 [数据库文档](./docs/integrations/database/)

### 可选但推荐提前配置


| 功能   | 变量                                    | 详细文档                                                           |
| ---- | ------------------------------------- | -------------------------------------------------------------- |
| 文件上传 | `STORAGE_*` + `CDN_BASE_URL`          | `[docs/integrations/storage/](./docs/integrations/storage/)`   |
| 发送邮件 | `RESEND_API_KEY` / `SENDGRID_API_KEY` | `[docs/integrations/email/](./docs/integrations/email/)`       |
| 防机器人 | `TURNSTILE_*`                         | `[docs/integrations/security/](./docs/integrations/security/)` |


---

## 3. 框架 vs 业务 — 代码边界清单

### 框架层（不需要修改，直接复用）


| 路径                          | 说明                                                 |
| --------------------------- | -------------------------------------------------- |
| `src/env.js`                | 环境变量 Schema 统一入口（Zod 校验）                           |
| `src/server/db.ts`          | Prisma Client 单例                                   |
| `src/server/redis.ts`       | Redis 客户端单例（ioredis）                               |
| `src/server/ratelimit.ts`   | 基于 Redis 的请求限流                                     |
| `src/server/auth/config.ts` | NextAuth 配置（按需增减 provider）                         |
| `src/server/email/`         | 邮件发送抽象（Resend / SendGrid 自动切换）                     |
| `src/server/api/trpc.ts`    | tRPC 中间件（认证、限流）                                    |
| `src/server/order/`         | 订单状态机（通用，不与产品耦合）                                   |
| `src/server/features/`      | 框架内置功能（[详见](./docs/features/)）                     |
| `src/server/events/bus.ts`  | 事件总线（模块间通信，详见第 5 章）                               |
| `src/server/modules/`       | 可插拔模块注册表与模块实现（详见第 5 章）                           |
| `src/config/modules.ts`     | 模块启停配置（环境变量驱动）                                    |
| `src/workers/`              | Worker 进程入口与调度框架（[详见](./docs/integrations/queue/)） |
| `src/components/ui/`        | 基础 UI 组件（shadcn/ui 风格）                             |
| `src/components/auth/`      | 登录相关组件                                             |
| `src/components/layout/`    | 全局布局组件                                             |


### 框架 + 配置层（复用引擎，替换配置）


| 路径                           | 需要定制的部分            |
| ---------------------------- | ------------------ |
| `src/server/billing/config/` | 积分包定义、消耗规则、订阅档位    |
| `src/config/modules.ts`      | 按需启停可插拔模块（通过环境变量） |
| `prisma/schema.prisma`       | 保留核心表，删除/替换业务相关表   |
| `src/app/admin/`             | 保留通用管理页，删除业务特定视图   |


### 业务层（完全替换为新产品逻辑）


| 路径                            | 替换说明                      |
| ----------------------------- | ------------------------- |
| `src/modules/<your-feature>/` | 按 `modules/example/` 结构创建 |
| `src/server/product/`         | 重新定义产品 SKU、定价结构           |
| `src/app/(feature)/`          | 核心功能前端页面                  |
| `src/app/pricing/`            | 基于新产品定价重写                 |
| `src/app/page.tsx`            | 首页完全替换                    |


### Prisma Schema 边界

```
保留（框架通用表）          替换（业务专用表）
─────────────────────    ──────────────────────────
User                      （你的业务 Model）
Account / Session
BillingAccount
BillingTransaction
Order / OrderItem
Membership / MembershipCycle
PromoCode / PromoUsage
AffiliateAccount
Touch / TouchLog
SupportTicket
```

---

## 4. 从框架到生产应用 — 分阶段 Checklist

### 阶段一：基础运行

> 目标：`pnpm dev` 跑起来，可以注册登录

- 配置 `DATABASE_URL` + `REDIS_HOST` + `NEXTAUTH_SECRET`
- 配置至少一个 OAuth 登录（[认证文档](./docs/integrations/auth/)）
- `docker compose up -d` → `pnpm db:migrate` → `pnpm dev`
- 确认访问 `/auth/signin` 可以登录

### 阶段二：存储与邮件

> 目标：用户可以上传文件，系统可以发送邮件

- 配置对象存储（[存储文档](./docs/integrations/storage/)）
- 配置邮件服务（[邮件文档](./docs/integrations/email/)）
- 验证域名 SPF / DKIM / DMARC

### 阶段三：定义产品与定价

> 目标：明确卖什么、卖多少钱

- 确定产品模型：一次性购买 / 订阅 / 积分包
- 在 `src/server/product/` 定义 SKU
- 在 `src/server/billing/config/` 配置积分规则
- 在 `prisma/schema.prisma` 中添加业务 Model，运行 `pnpm db:migrate`

### 阶段四：实现核心 AI 功能

> 目标：替换模板的示例逻辑，实现你的核心 AI 功能

- 在 `src/modules/<name>/` 下创建功能模块（参考 `modules/example/`）
- 异步功能在 `src/workers/processors/` 下新建 Processor（[队列文档](./docs/integrations/queue/)）
- 构建前端 UI 页面，替换首页

### 阶段五：支付集成

> 目标：完整的购买 → 积分发放 → 使用扣减链路可用

- 选择支付渠道，配置 env 和 Webhook（[支付文档](./docs/integrations/payment/)）
- 测试完整流程：选择产品 → 支付 → Webhook → 积分到账
- 测试退款、订阅续费
- 支付相关的副作用（通知、分析、佣金）由可插拔模块自动处理，无需额外代码

### 阶段六：启用可插拔模块

> 目标：按需开启分析、通知、推广等非核心功能

- 查看 [模块清单](#模块清单)，决定需要启用哪些模块
- 配置对应的环境变量（API Key），模块自动启用
- 无需修改任何代码，事件总线会自动连接模块
- 测试：启动后查看日志确认 `Module initialized` 输出
- 如需创建自定义模块，参考 [创建新模块](#创建新模块)

### 阶段七：用户触达

> 目标：关键节点自动触达用户

- 在 `src/server/touch/config/` 配置触达场景
- 编写邮件模板（`src/server/email/templates/`）
- 在 Worker 中配置定时调度

### 阶段七：用户触达

> 目标：关键节点自动触达用户

- Touch 模块默认启用（可通过 `DISABLE_TOUCH=true` 禁用）
- 在 `src/server/touch/config/` 配置触达场景
- 编写邮件模板（`src/server/email/templates/`）
- 在 Worker 中配置定时调度

### 阶段八：运营后台与通知

> 目标：内部运营管理

- 配置 Admin 权限，添加必要视图
- 配置运营通知渠道 — 设置 `LARK_APP_ID` / `TELEGRAM_BOT_TOKEN` 即自动启用对应模块
- 配置 Turnstile 防机器人（[安全文档](./docs/integrations/security/)）

### 阶段九：生产部署

> 目标：在生产环境稳定运行

- 选择部署模式：统一镜像（`Dockerfile`，`SERVICE_MODE` 控制）或拆分镜像（`Dockerfile.web` / `.api` / `.worker`）
- 配置生产级数据库（[数据库文档](./docs/integrations/database/)）
- 配置 SSL、CI/CD、健康检查告警
- 所有三类服务均内置 `/health` + `/ready` 端点

### 阶段十：安全加固

> 目标：符合基本生产安全标准

- 生产 `NEXTAUTH_SECRET` 使用强随机密钥
- 开发 key 与生产 key 完全分离
- 审查限流配置（`src/server/ratelimit.ts`）
- Webhook 端点验证签名
- 数据库连接使用 SSL

---

## 5. 可插拔模块架构

框架中的第三方集成和非核心功能被设计为**可插拔模块**。每个模块通过环境变量自动启停，不需要修改任何代码即可开关。

### 设计动机

在实际使用框架开发产品时，并非所有第三方集成和附加功能都是必需的。旧架构中这些功能与核心业务逻辑紧密耦合（如支付 Webhook 中直接调用 Google Ads、PostHog、Lark 通知），导致禁用某个功能需要修改多个文件。新架构通过**事件总线 + 模块注册表**将它们彻底解耦。

### 核心概念

#### 事件总线 (`src/server/events/bus.ts`)

核心业务逻辑完成后通过 `appEvents.emit()` 发出事件，模块订阅感兴趣的事件来执行副作用：

```
核心流程（支付完成）──emit──→ "payment:succeeded"
                                 ├──→ Google Ads 模块：上传离线转化
                                 ├──→ PostHog 模块：采集支付事件
                                 ├──→ Lark 模块：发送运营通知
                                 └──→ Affiliate 模块：创建佣金记录
```

每个事件处理器独立隔离，单个模块失败不影响其他模块和核心流程。

已定义的事件类型：

| 事件 | 触发时机 |
| --- | --- |
| `payment:succeeded` | 支付成功（Stripe/NowPayments/Telegram Stars） |
| `payment:failed` | 支付失败 |
| `payment:refunded` | 退款完成 |
| `subscription:renewed` | 订阅续期 |
| `subscription:canceled` | 订阅取消 |
| `subscription:invoice_failed` | 订阅扣款失败 |
| `order:fulfilled` | 订单完成履约 |
| `user:signup` | 新用户注册 |
| `fraud:efw` | Stripe Early Fraud Warning |

#### 模块注册表 (`src/server/modules/registry.ts`)

每个模块实现 `FrameworkModule` 接口：

```typescript
interface FrameworkModule {
  name: string;
  enabled: boolean;
  registerEventHandlers?(bus: AppEventBus): void;  // 订阅事件
  getRouter?(): AnyRouter;                          // 提供 tRPC 路由
  getWebhookHandler?(): { path: string; handler: (req: Request) => Promise<Response> };
  onInit?(): Promise<void>;                         // 初始化逻辑
}
```

#### 配置开关 (`src/config/modules.ts`)

模块的启停由**环境变量**驱动，遵循两条规则：

1. **有 API Key 则自动启用** — 配置了 `POSTHOG_API_KEY` 则 PostHog 自动生效
2. **`DISABLE_*` 强制禁用** — 设置 `DISABLE_POSTHOG=true` 可覆盖第一条规则

### 模块清单

| 模块 | 类别 | 自动启用条件 | 强制禁用变量 |
| --- | --- | --- | --- |
| Google Ads | 分析/广告 | `GOOGLE_ADS_CUSTOMER_ID` + `GOOGLE_ADS_DEVELOPER_TOKEN` | `DISABLE_GOOGLE_ADS` |
| PostHog | 分析 | `POSTHOG_API_KEY` 或 `NEXT_PUBLIC_POSTHOG_KEY` | `DISABLE_POSTHOG` |
| Lark/飞书 | 通知 | `LARK_APP_ID` + `LARK_APP_SECRET` | `DISABLE_LARK` |
| Telegram | 通知/支付 | `TELEGRAM_BOT_TOKEN` | `DISABLE_TELEGRAM` |
| NowPayments | 支付 | `NOWPAYMENTS_API_KEY` | `DISABLE_NOWPAYMENTS` |
| Affiliate | 功能 | 默认启用 | `DISABLE_AFFILIATE` |
| Touch | 功能 | 默认启用 | `DISABLE_TOUCH` |
| AI Chat | 功能 | 任一 LLM API Key | `DISABLE_AI_CHAT` |

### 模块加载流程

```
启动时 initModules()
  │
  ├── 遍历 MODULES 配置
  │     ├── enabled=true → 动态 import 模块
  │     └── enabled=false → 跳过
  │
  ├── 对每个已加载模块
  │     ├── registerEventHandlers(appEvents) — 订阅事件
  │     └── onInit() — 执行初始化
  │
  └── 日志输出已加载模块列表
```

tRPC 路由也根据模块状态动态挂载（`src/server/api/root.ts`），禁用的模块其路由完全不存在。Webhook 路由端点通过配置守卫返回 404。

### 创建新模块

1. 在 `src/config/modules.ts` 添加配置开关
2. 创建 `src/server/modules/<name>.ts`，实现 `FrameworkModule` 接口
3. 在 `src/server/modules/index.ts` 的 `initModules()` 中条件导入
4. （可选）如有 tRPC 路由，在 `src/server/api/root.ts` 中条件挂载
5. （可选）如有 Webhook 端点，在路由处添加配置守卫

---

## 6. 关键架构决策说明

### 积分模型

所有 AI 功能消耗以**积分（Credits）**为单位，与产品定价解耦：

```
用户购买产品 → 获得积分 → AI 操作消耗积分 → 积分耗尽需补充
```

积分管理通过 Velobase Billing SDK 云端处理，本地不存储余额。

### 支付网关路由

系统通过 `resolvePaymentGateway()` 自动选择支付渠道（详见[支付文档](./docs/integrations/payment/)）。  
开发测试可用 `FORCE_PAYMENT_GATEWAY` 强制指定。

### 三服务架构与 SERVICE_MODE

本框架支持三类运行时进程，通过 `SERVICE_MODE` 环境变量灵活组合：

```
SERVICE_MODE=all（默认）
┌─────────────────────────────────────────────┐
│  单进程 / 单 Pod                              │
│                                             │
│  Web（Next.js :3000）                         │
│  API（Hono :3002）                            │
│  Worker（BullMQ + Fastify :3001）              │
└─────────────────────────────────────────────┘

SERVICE_MODE=web / api / worker（生产拆分）
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Web :3000   │  │  API :3002   │  │ Worker :3001 │
│  Next.js     │  │  Hono        │  │ BullMQ       │
└──────────────┘  └──────────────┘  └──────────────┘
  各自独立 Pod，同一镜像不同 SERVICE_MODE
```

| 服务 | 职责 | 入口 |
| --- | --- | --- |
| Web | 面向浏览器的 Next.js 站点与 tRPC | `next start` / `src/web/start.ts` |
| API | 独立 HTTP 面：集成、Webhook、解耦接口 | `src/api/index.ts` |
| Worker | BullMQ 异步任务与定时作业 | `src/workers/index.ts` |

- 开发/小规模：`SERVICE_MODE=all` — 1 个 Pod，省资源
- 生产：3 个 Pod，各自 `SERVICE_MODE=web/api/worker`，独立扩缩容
- 按需组合：`SERVICE_MODE=web,api`（Web + API 合并）

详见 [docs/architecture/web-api-service-split.md](./docs/architecture/web-api-service-split.md)。

### 多环境行为差异


| `NEXT_PUBLIC_APP_ENV` | 环境   | 典型差异            |
| --------------------- | ---- | --------------- |
| `dev`                 | 本地开发 | 关闭部分限流，详细错误信息   |
| `staging`             | 测试环境 | 测试支付 key，不发真实邮件 |
| `prod`                | 生产环境 | 全部限流开启，使用真实支付   |


### tRPC 类型安全

```
1. 在 src/server/api/routers/<feature>.ts 定义 procedure
2. 在 src/server/api/root.ts 挂载 router（核心路由直接挂载，可插拔模块路由条件挂载）
3. 前端直接 api.<feature>.<procedure>.useQuery() — 类型自动推断
```

