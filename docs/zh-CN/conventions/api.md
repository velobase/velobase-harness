# API 约定

本文档定义 AI Agent 和开发者如何创建、修改 tRPC routers、Hono routes、webhooks 和产品 API。

## API 分区

### 锁定区：框架平台 API

框架 API 是可复用 SaaS 能力。产品代码可以调用它们，但不应修改公开 procedure 签名，也不应把产品特定逻辑写入其中。

示例：

- `product.*`
- `billing.*`
- `order.*`
- `membership.*`
- `promo.*`
- `account.*`
- `admin.*`

规则：

- 需要时从产品流程调用框架 API。
- 除非用户明确要求，不修改既有 router 签名。
- 不在锁定区 router 中加入产品特定逻辑。

### 扩展区：第三方集成 API

集成 API 封装外部服务。可以按 provider 模式扩展，但既有公开接口应保持稳定。

示例：

- `storage.*`
- `auth/[...nextauth]`
- `src/app/api/webhooks/stripe`
- `src/app/api/webhooks/nowpayments`
- `src/app/api/webhooks/resend`
- `src/app/api/webhooks/telegram`
- `src/app/api/lark/webhook`

规则：

- 修改前阅读对应 `docs/zh-CN/integrations/*/README.md`。
- 新增 provider 时遵循已有 provider 边界。
- 产品代码不要直接调用外部 SDK。

### 自由区：产品 API

API 路由调用 `src/server/<capability>/` 下的服务，私有产品 API 留在私有产品仓库。

规则：

- 在模块内创建新 router。
- 在 `src/server/api/root.ts` 挂载 router。
- Router 保持薄层，业务逻辑放入 service modules。
- 事件、队列、计费、存储和邮件都通过框架封装使用。

## tRPC 规则

Procedure 选择：

```text
公开读操作                         -> publicProcedure
需要登录的读写                     -> protectedProcedure
仅管理员操作                       -> adminProcedure
高频且需要限流的操作               -> rateLimitedProcedure
```

通用规则：

- 所有 input 使用 Zod 或等价 schema 校验。
- mutation 默认 protected，除非明确公开。
- 列表查询使用 cursor-based pagination。
- 默认 page size 为 20。
- Router 只选择 procedure、校验 input、调用 service。
- Service 负责 ownership 和业务不变量。

## Hono 与 Webhook 规则

- 当前生产 webhook 在 Web runtime 的 `src/app/api/**` 下。
- 只有显式启用可选 API 服务时，Hono routes 才放在 `src/api/routes/`。
- Hono routes 不要导入 `next/headers`、`next/server` 等 Next.js-only APIs。
- 除非部署会启用 API 服务，否则不要把已有 Next Route Handler 迁到 Hono。
- Webhook 处理前必须验证签名。
- Webhook 和 worker 必须幂等。
- 禁用的可插拔模块不能暴露可用 webhook endpoints。

## 错误

- 预期 tRPC 业务错误使用 `TRPCError`。
- 不泄露密钥、token、数据库连接串或 provider 敏感原始响应。
- 日志需要足够排查上下文，但不能暴露隐私数据。

## 国际化

API 驱动的用户可见 UI 文案应在前端通过 i18n 渲染。不要在 JSX 中硬编码用户可见英文字符串。
