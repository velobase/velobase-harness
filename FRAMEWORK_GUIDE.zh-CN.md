# AI SaaS Framework 开发指南

这是 Velobase Harness 的中文框架指南镜像。英文 canonical 见 [`FRAMEWORK_GUIDE.md`](./FRAMEWORK_GUIDE.md)。

## 从这里开始

写产品代码前：

1. 阅读 [`AGENTS.zh-CN.md`](./AGENTS.zh-CN.md) 或英文 canonical [`AGENTS.md`](./AGENTS.md)。
2. 完成 [`docs/zh-CN/ai/design.md`](./docs/zh-CN/ai/design.md) 中的 Phase 0。
3. 等用户确认 MVP scope。
4. 在 `src/modules/<name>/` 下实现产品特定行为。
5. 最终回复、commit、push 或部署前执行 [`docs/zh-CN/ai/completion-checklist.md`](./docs/zh-CN/ai/completion-checklist.md)。

## 架构

Velobase Harness 是采用渐进式工作区边界的多平台 AI SaaS 底座：

- Next.js App Router 和 React 作为 Web。
- Electron 桌面端隔离 main/preload/renderer，Expo 单一代码库支持 Android/iOS。
- 各应用宿主共用平台无关契约与类型化客户端。
- tRPC 提供类型安全应用 API。
- 可选 Hono API 用于不适合由 Web 承接的独立外部 HTTP routes。
- Prisma、PostgreSQL、Redis 提供持久化和队列依赖。
- NextAuth 提供认证。
- BullMQ workers 处理可重试后台任务。
- Event bus 和可插拔模块处理 analytics、ads、notifications 等副作用。

Runtime services：

目录归属、平台命令、Linux 验证与共享健康检查扩展方式见
[多平台工作区](./docs/zh-CN/architecture/multiplatform.md)。
Web 组装归 `apps/web`，根 `src/app` 保留兼容路由表。

| 服务 | 职责 | 文档 |
| --- | --- | --- |
| Web | Pages、UI、App Router、tRPC、当前生产 webhook | [`docs/zh-CN/architecture/web-api-service-split.md`](./docs/zh-CN/architecture/web-api-service-split.md) |
| API | 用于独立外部 HTTP 的可选 Hono routes | [`docs/zh-CN/architecture/web-api-service-split.md`](./docs/zh-CN/architecture/web-api-service-split.md) |
| Worker | BullMQ processors 和 schedulers | [`docs/zh-CN/integrations/queue/README.md`](./docs/zh-CN/integrations/queue/README.md) |

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm docker:db:up
pnpm db:push
pnpm db:seed
pnpm dev:all
```

调试特定服务时拆分启动：

```bash
pnpm dev
pnpm worker:dev
```

只有在开发可选独立 Hono routes 时才启动 `pnpm api:dev`。

## 代码边界

框架代码保持通用。产品行为放在 `src/modules/<name>/`，除非已有扩展点更合适。

| 区域 | 归属 |
| --- | --- |
| `apps/web`、`apps/desktop`、`apps/mobile` | 平台组装、UI 与适配器 |
| `packages/contracts`、`packages/api-client` | 平台无关接口契约与客户端操作 |
| `services/api`、`services/worker` | 后台进程入口，原有路径继续转发 |
| `src/server/auth` | 框架认证 |
| `src/server/billing`、`src/server/order`、`src/server/membership` | 框架商业化能力 |
| `src/server/features` | 内置可复用功能 |
| `src/server/modules` | 事件驱动可插拔模块 |
| `src/modules/<name>` | 产品特定模块 |
| `src/workers` | 队列和 processor runtime |
| `src/api` | 可选独立 Hono API runtime |

## 产品实现流程

1. Phase 0 设计：[`docs/zh-CN/ai/design.md`](./docs/zh-CN/ai/design.md)。
2. 新模块创建：[`docs/zh-CN/ai/new-module.md`](./docs/zh-CN/ai/new-module.md)。
3. API 规则：[`docs/zh-CN/conventions/api.md`](./docs/zh-CN/conventions/api.md)。
4. 具体集成规则：[`docs/zh-CN/integrations/README.md`](./docs/zh-CN/integrations/README.md)。
5. 内置功能：[`docs/zh-CN/features/README.md`](./docs/zh-CN/features/README.md)。
6. 测试：[`docs/zh-CN/ai/testing.md`](./docs/zh-CN/ai/testing.md)。
7. 完成检查：[`docs/zh-CN/ai/completion-checklist.md`](./docs/zh-CN/ai/completion-checklist.md)。

## 数据库变更

- 产品实体可以添加到 `prisma/schema.prisma`。
- 除非用户明确要求，不修改框架保留表。
- 本地实验可以使用 `pnpm db:push`。
- 可提交、可部署变更需要 Prisma migrations。
- 必填字段需要为已有数据设计安全迁移路径。

详见 [`docs/zh-CN/integrations/database/README.md`](./docs/zh-CN/integrations/database/README.md)。

## 可插拔模块

可插拔模块订阅领域事件，不应被核心流程直接调用。

核心流程：

```text
business service -> appEvents.emit() -> pluggable modules -> providers / side effects
```

规则：

- Module enablement 放在 `src/config/modules.ts`。
- 可插拔模块实现 `FrameworkModule`。
- 禁用模块不得暴露 routers 或 webhook endpoints。
- 模块之间通过事件通信，不通过产品模块直接 import。

## 生产就绪

部署前：

- 配置 auth、database、Redis 和所需 provider keys。
- 确认 `SERVICE_MODE` 部署形态。默认是 `web,worker`；只有真实 Hono routes 需要承载时才启用 API。
- 运行质量检查。
- 确认 migrations。
- 支付或 worker 变更要验证 webhooks、queues 和 idempotency。

详见 [`docs/zh-CN/deployment/cloud-deploy.md`](./docs/zh-CN/deployment/cloud-deploy.md) 和 [`docs/zh-CN/ai/completion-checklist.md`](./docs/zh-CN/ai/completion-checklist.md)。
