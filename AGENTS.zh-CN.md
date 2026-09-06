# AI Agent 指南

本文件是 Cursor、Claude Code、GitHub Copilot、Windsurf 和通用 agent runner 的中文镜像入口。

英文 canonical 入口是 [`AGENTS.md`](./AGENTS.md)。如果英文和中文不一致，以英文为准。

## 任务路由

跨平台工作请阅读 `docs/zh-CN/architecture/multiplatform.md`。应用组装放在 `apps/*`，
进程入口放在 `services/*`，平台无关契约/客户端放在 `packages/*`。
Desktop/Mobile 禁止引用既有 `src` 或 Web/Server 包，环境配置使用各平台独立校验边界。

如果用户要求从零构建新产品：

- 必须阅读 `docs/zh-CN/ai/design.md`。
- 写产品代码前必须完成领域设计。

如果准备在 `src/modules/` 下创建新业务模块：

- 必须先阅读 `docs/zh-CN/ai/new-module.md`。

如果准备创建或修改测试（`*.test.ts`、`*.spec.ts` 或 `e2e/*`）：

- 必须先阅读 `docs/zh-CN/ai/testing.md`。

开发完成后：

- 必须执行 `docs/zh-CN/ai/completion-checklist.md` 中的检查。
- 必须告诉用户运行了哪些检查、跳过了哪些检查。

## 集成路由

如果触及认证或登录：

- 阅读 `docs/zh-CN/integrations/auth/README.md`。

如果触及 billing、orders、payments、subscriptions、products、credits 或 promo codes：

- 阅读 `docs/zh-CN/integrations/payment/README.md`。

如果触及邮件发送或邮件模板：

- 阅读 `docs/zh-CN/integrations/email/README.md`。

如果触及 database、Prisma、migrations、Redis 或 env-backed persistence：

- 阅读 `docs/zh-CN/integrations/database/README.md`。

如果触及文件上传、对象存储、CDN URLs 或 asset access：

- 阅读 `docs/zh-CN/integrations/storage/README.md`。

如果触及 analytics、feature flags 或 product events：

- 阅读 `docs/zh-CN/integrations/analytics/README.md`。

如果触及 ad attribution 或 conversion upload：

- 阅读 `docs/zh-CN/integrations/ads/README.md`。

如果触及 queues、workers、processors 或 scheduled jobs：

- 阅读 `docs/zh-CN/integrations/queue/README.md`。

如果触及 anti-abuse、captcha、rate limiting、IP、country 或 security boundaries：

- 阅读 `docs/zh-CN/integrations/security/README.md` 和相关 `docs/zh-CN/features/*/README.md`。

## 核心规则

- 框架代码保持通用。产品特定行为放入 `src/modules/<name>/`，除非已有框架扩展点更适合。
- 所有用户输入用 Zod 或等价 schema 校验。
- 列表查询使用 cursor-based pagination，默认 page size 为 20。
- 使用 `createLogger("module-name")` 记录结构化日志。
- 环境变量通过 `src/env.js` 读取。应用代码不要直接读 `process.env`。
- 未经用户明确要求，不回滚用户改动。
- Server Components 使用 `await auth()`；Client Components 使用 `useSession()`。
- 登录 UI 使用 `useLogin()`。
- 使用 `db` 和 `redis` 单例，不创建新的 PrismaClient 或临时 Redis 连接。
- Router 保持薄层，业务逻辑放在 service modules。
- 支付、邮件、存储、analytics、ads 和 workers 都使用框架封装。
- Hono API 服务默认不启用。只有明确需要独立外部 HTTP routes 时才使用它；当前生产 webhook 在 Web runtime 的 `src/app/api/**` 下。
- 用户可见 UI 文案使用 `useTranslations()` 或 `getTranslations()`。
- 生产问题使用 `docs/zh-CN/debugging/online-local-debug.md` 的流程。
