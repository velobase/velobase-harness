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
- Prisma 6 + PostgreSQL（数据库）+ Redis（缓存/队列）
- NextAuth v5（认证）
- Tailwind CSS 4 + Radix UI（UI）
- BullMQ（后台任务）

## 项目结构

```
src/
├── app/              # Next.js 页面和 API 路由
├── modules/          # 业务功能模块（参考 modules/example/）
├── server/           # 服务端代码
│   ├── api/          # tRPC 路由（root.ts 是注册中心）
│   ├── auth/         # 认证
│   ├── email/        # 统一邮件服务
│   ├── billing/      # 计费（Velobase SDK）
│   ├── order/        # 订单
│   ├── features/     # 框架内置功能（anti-abuse / cdn-adapters / daily-bonus）
│   └── ...
├── components/       # 共享 UI 组件
├── workers/          # BullMQ 后台任务
└── analytics/        # 事件追踪
```

## 添加新功能

> 详细步骤和代码模式 → `[docs/conventions/api.md](./docs/conventions/api.md)`

1. 参考 `src/modules/example/` 的结构（含 README）
2. 在 `prisma/schema.prisma` 添加数据模型
3. 创建 `src/modules/<name>/server/service.ts`（业务逻辑）+ `router.ts`（瘦 Router）
4. 在 `src/server/api/root.ts` 注册新 router
5. 运行 `npx prisma db push`
6. 前端通过 `api.<name>.<procedure>.useQuery/useMutation()` 调用

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

- 发起支付通过 `trpc.order.checkout`，**禁止**在前端直接调用 Stripe SDK
- 支付状态更新仅由 Webhook 驱动，前端 `confirmPayment` 仅作补偿轮询
- 权益发放通过 `fulfillment/manager.ts`，**禁止**在 Webhook handler 中直接操作余额
- 积分操作通过 `billing` 域的 `grant/deduct`，不直接写 DB
- **禁止**硬编码商品价格，应通过 Product 表查询

### 存储

> 详细架构和 Provider 配置 → `[docs/integrations/storage/](./docs/integrations/storage/)`

- 统一使用 `@/server/storage` 导出的函数，**禁止**直接调用 S3 SDK

### 后台任务

> 详细架构和添加新队列的步骤 → `[docs/integrations/queue/](./docs/integrations/queue/)`

- 参考 `src/modules/example/worker/` 创建新的后台任务
- 使用 `createWorkerInstance()` 工厂函数创建 Worker，**禁止**直接 `new Worker()`
- 新队列必须注册到 `src/workers/queues/index.ts` + `processors/index.ts` + `index.ts`

### 分析（Analytics）

> 详细架构和事件定义 → `[docs/integrations/analytics/](./docs/integrations/analytics/)`

- **客户端**埋点用 `track()` from `@/analytics`，**服务端**埋点用 `safeTrack()` from `@/analytics/server`
- **绝不在服务端代码中导入 `@/analytics`**（只能导入 `@/analytics/server` 和 `@/analytics/events/*`）
- 新事件先在 `src/analytics/events/` 定义常量 + Properties interface，再使用
- Feature Flag 客户端用 `useFeatureFlagVariantKey()`，服务端用 `getFeatureFlag()` from `@/server/experiments`

### 广告（Ads）

> 详细架构和归因链路 → `[docs/integrations/ads/](./docs/integrations/ads/)`

- 前端广告追踪从 `@/analytics/ads` 导入，**禁止**直接调用 `window.gtag` 或 `window.twq`
- 支付履约后调用 `enqueueGoogleAdsUploadsForPayment(paymentId)` 触发服务端离线回传
- 修改 Google Ads ID → `src/analytics/ads/google.ts`；修改 Twitter 事件 ID → `src/analytics/ads/twitter.ts`

### 框架内置功能

> 功能清单和各功能详细文档 → `[docs/features/](./docs/features/)`

- **每日签到赠送**：`src/server/features/daily-bonus/` — 修改赠送额度看代码中常量
- **注册反滥用**：`src/server/features/anti-abuse/` — 修改检测策略看代码中策略函数
- **CDN 适配**：`src/server/features/cdn-adapters/` — IP/国家提取、Flexible SSL 检测

