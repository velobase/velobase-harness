# AI Agent 项目指南

本文件为 AI 编码工具提供项目上下文和编码规则。适用于 Cursor、Claude Code、GitHub Copilot、Windsurf 等。

> **定位**：本文件只包含 AI 写代码时必须遵守的**约束规则**。  
> 架构设计、快速启动、分阶段 Checklist → 见 `[FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md)`  
> API 三区制与编码约定 → 见 `[docs/conventions/api.md](./docs/conventions/api.md)`  
> 第三方集成详细文档 → 见 `[docs/integrations/](./docs/integrations/)`  
> 框架内置功能详细文档 → 见 `[docs/features/](./docs/features/)`

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript
- tRPC v11 + Zod（类型安全 API）
- Hono（独立 API 服务）
- Prisma 6 + PostgreSQL（数据库）+ Redis（缓存/队列）
- NextAuth v5（认证）
- Tailwind CSS 4 + Radix UI（UI）
- BullMQ + Fastify（后台任务 + Worker HTTP）

## 项目结构

```
src/
├── app/              # Next.js 页面和 API 路由
├── api/              # 独立 Hono API 服务（Webhook、集成接口）
│   ├── app.ts        # Hono 应用工厂
│   ├── start.ts      # startApi() 启动函数
│   ├── index.ts      # 独立进程入口
│   └── routes/       # API 路由（health、webhooks 等）
├── config/           # 模块配置（modules.ts — 环境变量驱动的模块启停）
├── web/              # Web 服务启动封装
│   └── start.ts      # startWeb() 启动函数（SERVICE_MODE=all 用）
├── modules/          # 业务功能模块（参考 modules/example/）
├── server/           # 服务端代码
│   ├── api/          # tRPC 路由（root.ts — 核心路由 + 条件挂载）
│   ├── standalone.ts # SERVICE_MODE 统一入口
│   ├── auth/         # 认证
│   ├── email/        # 统一邮件服务
│   ├── billing/      # 计费（Velobase SDK）
│   ├── order/        # 订单
│   ├── events/       # 事件总线（bus.ts — 模块解耦通信）
│   ├── modules/      # 可插拔模块（registry.ts + 各模块实现）
│   ├── features/     # 框架内置功能（anti-abuse / cdn-adapters / daily-bonus）
│   └── ...
├── components/       # 共享 UI 组件
├── workers/          # BullMQ 后台任务
│   ├── start.ts      # startWorker() 启动函数
│   ├── registry.ts   # WorkerRegistry 自动注册
│   ├── index.ts      # 独立进程入口
│   └── ...
└── analytics/        # 事件追踪
```

## 三服务架构

本框架支持三类运行时进程，通过 `SERVICE_MODE` 环境变量灵活组合：

- `SERVICE_MODE=all`（默认）：Web + API + Worker 在同一进程
- `SERVICE_MODE=web`：仅 Next.js
- `SERVICE_MODE=api`：仅 Hono API
- `SERVICE_MODE=worker`：仅 BullMQ Worker
- 支持逗号组合：`SERVICE_MODE=web,api`

统一入口：`src/server/standalone.ts`

## 添加新功能

> 详细步骤和代码模式 → `[docs/conventions/api.md](./docs/conventions/api.md)`

**业务功能模块（始终启用）：**

1. 参考 `src/modules/example/` 的结构（含 README）
2. 在 `prisma/schema.prisma` 添加数据模型
3. 创建 `src/modules/<name>/server/service.ts`（业务逻辑）+ `router.ts`（瘦 Router）
4. 在 `src/server/api/root.ts` 注册新 router
5. 运行 `npx prisma db push`
6. 前端通过 `api.<name>.<procedure>.useQuery/useMutation()` 调用

**可插拔模块（按需启停）：**

1. 在 `src/config/modules.ts` 添加配置开关
2. 创建 `src/server/modules/<name>.ts`，实现 `FrameworkModule` 接口
3. 在 `src/server/modules/index.ts` 的 `initModules()` 中条件导入
4. （可选）在 `src/server/api/root.ts` 中条件挂载 tRPC 路由
5. （可选）在 Webhook 路由处添加配置守卫

## 编码规则

### 通用

- 所有 mutation 必须使用 `protectedProcedure`（类型强制）
- 所有用户输入必须用 Zod 校验
- 数据库查询必须分页（cursor-based pagination，默认 limit=20）
- 使用 `createLogger("module-name")` 创建结构化日志
- 环境变量通过 `src/env.js`（T3 Env）统一管理，不要直接读 `process.env`

### 认证

> 详细架构和 Provider 配置 → `[docs/integrations/auth/](./docs/integrations/auth/)`

- Server Component 获取用户：`const session = await auth()`（从 `@/server/auth` 导入）
- 客户端获取用户：`useSession()` from `next-auth/react`
- 登录统一通过 `useLogin()` hook（`@/components/auth/use-login`），**禁止**直接调用 `signIn()`
- **禁止**在客户端存储敏感认证信息或直接操作 JWT/session token

### 邮件

> 详细架构和 Provider 配置 → `[docs/integrations/email/](./docs/integrations/email/)`

- 统一使用 `sendEmail()` from `@/server/email`，**禁止**直接调用 Resend/SendGrid SDK
- 同时提供 `react` 和 `html` 版本以确保所有 provider 兼容
- Support 模块的 SMTP（nodemailer）是独立的客服回复通道，不走 `sendEmail()`

### 数据库

> 详细架构和启动方式 → `[docs/integrations/database/](./docs/integrations/database/)`

- 使用 `db` from `@/server/db`，**禁止**自己创建 PrismaClient
- 使用 `redis` from `@/server/redis`，**禁止**自己创建 Redis 连接
- 修改 schema 后运行 `npx prisma db push`

### 支付

> 详细架构和网关配置 → `[docs/integrations/payment/](./docs/integrations/payment/)`

- Stripe 客户端**必须**通过 `getStripe()` from `@/server/order/services/stripe/client` 获取，**禁止**自行 `new Stripe()` 或 `import("stripe")`
- `apiVersion` 由 `client.ts` 的 `STRIPE_API_VERSION` 统一管理，**禁止**在其他文件中硬编码
- 发起支付通过 `trpc.order.checkout`，**禁止**在前端直接调用 Stripe SDK
- 支付状态更新仅由 Webhook 驱动，前端 `confirmPayment` 仅作补偿轮询
- 权益发放通过 `fulfillment/manager.ts`，**禁止**在 Webhook handler 中直接操作余额
- 积分操作通过 `billing` 域的 `grant/deduct`，不直接写 DB
- **禁止**硬编码商品价格，应通过 Product 表查询

### 存储

> 详细架构和 Provider 配置 → `[docs/integrations/storage/](./docs/integrations/storage/)`

- 统一使用 `@/server/storage` 导出的函数，**禁止**直接调用 S3 SDK

### 独立 API 服务（Hono）

- API 路由写在 `src/api/routes/` 目录下，使用 Hono 路由语法
- 在 `src/api/app.ts` 中通过 `app.route()` 注册新路由
- 适合放到 API 服务的：Webhook 接收、对外集成接口、不依赖 Next.js 的 HTTP 端点
- 仍需 Next.js 能力的（SSR、tRPC、NextAuth 回调）保留在 `src/app/api/`
- **禁止**在 API 服务中导入 Next.js 特有模块（`next/server`、`next/headers` 等）

### 后台任务

> 详细架构和添加新队列的步骤 → `[docs/integrations/queue/](./docs/integrations/queue/)`

- 参考 `src/modules/example/worker/` 创建新的后台任务
- 使用 `createWorkerInstance()` 工厂函数创建 Worker，**禁止**直接 `new Worker()`
- 新队列必须在 `src/workers/queues/index.ts` + `processors/index.ts` 导出，并在 `src/workers/start.ts` 中通过 `registry.register()` 注册

### 分析（Analytics）

> 详细架构和事件定义 → `[docs/integrations/analytics/](./docs/integrations/analytics/)`

- **客户端**埋点用 `track()` from `@/analytics`，**服务端**埋点用 `safeTrack()` from `@/analytics/server`
- **绝不在服务端代码中导入 `@/analytics`**（只能导入 `@/analytics/server` 和 `@/analytics/events/*`）
- 新事件先在 `src/analytics/events/` 定义常量 + Properties interface，再使用
- Feature Flag 客户端用 `useFeatureFlagVariantKey()`，服务端用 `getFeatureFlag()` from `@/server/experiments`
- 服务端 PostHog 事件采集已迁移到可插拔模块（`src/server/modules/posthog.ts`），通过事件总线订阅 `payment:succeeded` 等事件自动触发
- **禁止**在支付/订单代码中直接调用 PostHog capture — 由模块事件处理器完成

### 事件总线与可插拔模块

> 详细架构设计和模块清单 → `[FRAMEWORK_GUIDE.md — 第 5 章](./FRAMEWORK_GUIDE.md#5-可插拔模块架构)`

**事件总线规则：**

- 核心业务逻辑完成后通过 `appEvents.emit()` from `@/server/events/bus` 发出事件
- **禁止**在核心流程中直接调用可插拔模块的函数（如 PostHog、Google Ads、Lark 通知），必须通过事件解耦
- 新增事件类型须在 `EventPayload` 类型中定义，保证类型安全
- 事件处理器内异常已自动隔离（`Promise.allSettled`），**禁止**在处理器中吞掉关键错误而不记录日志

**模块系统规则：**

- 模块配置集中在 `src/config/modules.ts`，**禁止**在其他文件中硬编码模块启停逻辑
- 新模块必须实现 `FrameworkModule` 接口（from `@/server/modules/registry`）
- 模块的 tRPC 路由在 `src/server/api/root.ts` 中条件挂载，禁用时路由不存在
- Webhook 路由端点必须添加配置守卫（检查 `MODULES.xxx.enabled`，禁用时返回 404）
- **禁止**在模块代码中导入其他可插拔模块 — 模块间通信通过事件总线

**副作用迁移规则：**

- 新增的通知、分析、广告追踪等副作用，必须作为模块事件订阅实现，**禁止**写在核心支付/订单流程中
- 已有模块订阅的事件列表参见 `src/server/modules/` 下各模块文件

### 广告（Ads）

> 详细架构和归因链路 → `[docs/integrations/ads/](./docs/integrations/ads/)`

- Google Ads 已改为可插拔模块（`src/server/modules/google-ads.ts`），通过事件总线订阅 `payment:succeeded` 自动触发离线回传
- **禁止**在支付/订单代码中直接调用 `enqueueGoogleAdsUploadsForPayment` — 该调用由模块的事件处理器完成
- 前端广告追踪从 `@/analytics/ads` 导入，**禁止**直接调用 `window.gtag` 或 `window.twq`
- 修改 Google Ads ID → `src/analytics/ads/google.ts`；修改 Twitter 事件 ID → `src/analytics/ads/twitter.ts`

### 框架内置功能

> 功能清单和各功能详细文档 → `[docs/features/](./docs/features/)`

- **每日签到赠送**：`src/server/features/daily-bonus/` — 修改赠送额度看代码中常量
- **注册反滥用**：`src/server/features/anti-abuse/` — 修改检测策略看代码中策略函数
- **CDN 适配**：`src/server/features/cdn-adapters/` — IP/国家提取、Flexible SSL 检测

### 国际化（i18n）

> 架构设计详见 `[docs/architecture/i18n-locale.md](./docs/architecture/i18n-locale.md)`  
> 语言配置 → `src/i18n/config.ts`；请求解析 → `src/i18n/request.ts`；文案 → `messages/*.json`

**核心规则：**

- 所有用户可见文案**必须**通过 `useTranslations(namespace)`（Client Component）或 `getTranslations(namespace)`（Server Component）获取
- **禁止**在组件 / 页面的 JSX 中硬编码用户可见的英文字符串
- Client Component 中 `useTranslations` 可直接使用，无需额外配置（根 Layout 已注入 `NextIntlClientProvider`）
- Server Component 中使用 `getTranslations`（从 `next-intl/server` 导入），无副作用可直接 `await`

**命名空间（namespace）边界：**

| 命名空间 | 归属 | 说明 |
|---|---|---|
| `common` `nav` `auth` `billing` `payment` `aiChat` `errors` `account` `admin` | **框架** | 由框架维护，**禁止**在此下新增业务 key |
| `landing` `product` 及其他自定义 key | **业务方** | 开发者在 `messages/en.json` 下自由添加 |

**新增 module 的文案约定：**
- 命名空间：`{moduleName}` （如 `aiChat`、`explorer`）
- key 结构：`{component}.{key}`（如 `aiChat.errorNetwork`）

**语言切换：**
- 用户切换语言通过 `LocaleSwitcher` 组件（写 `NEXT_LOCALE` Cookie → `location.reload()`）
- Cookie 优先级最高，其次 `Accept-Language`，兜底 `en`
- 禁止直接操作 `NEXT_LOCALE` Cookie，统一通过 `LocaleSwitcher`

**邮件模板：**
- 邮件渲染不在 Next.js 请求上下文中，**不使用** `next-intl`
- 需要多语言时，通过 `locale` 参数显式传入，使用独立的消息加载函数

**tRPC 错误处理：**
- 服务端 `TRPCError.message` 保持 code 字符串（如 `"USER_NOT_FOUND"`），**禁止**在服务端做语言翻译
- 前端展示错误时通过 `t('errors.USER_NOT_FOUND')` 在 Client 侧翻译

