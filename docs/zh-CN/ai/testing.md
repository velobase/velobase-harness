# AI 测试指南

创建或修改测试前阅读本文档。

目标：用最小可靠层级测试业务行为。优先覆盖正确性、权限、计费、持久化、Worker 幂等性和关键用户路径。

## 1. 选择测试层级

使用最低但足够可靠的层：

- 业务规则、计算、状态流转：service unit test。
- 输入校验、auth、ownership、persistence：tRPC router integration test。
- Hono route、webhook、health endpoint：HTTP route test。
- Queue processor 逻辑：processor unit test。
- 完整用户旅程：Playwright E2E。

默认金字塔：较多 service tests，适量 integration tests，少量 E2E tests。

## 2. 按变更类型覆盖

Service 变更：

- 新增或更新 `service.test.ts`。
- 每个 public method 覆盖 happy path 和一个 edge/error path。

Router 变更：

- 测试访问级别。
- 测试非法输入。
- 测试用户数据隔离。

Billing/payment 变更：

- 测试不会重复发放或扣减。
- 相关场景测试 webhook 幂等。
- 测试非法或未签名 webhook payload。

Worker 变更：

- 直接测试 processor。
- 测试 retry-safe 行为。
- 如果使用 progress updates，也要覆盖。

## 3. Service Unit Tests

测试放在源码旁边：

```text
src/server/<capability>/
├── service.ts
└── service.test.ts
```

规则：

- Mock 所有 I/O：database、network、storage、email、payment、queues。
- 测试行为，不测试 Prisma 内部细节。
- 时间相关逻辑使用 fake timers。

## 4. Router Integration Tests

测试 procedure access level、input validation、ownership boundaries 和 pagination shape。

需要 ownership 或 persistence 时使用测试数据库。不要访问真实外部 provider。

## 5. Hono、Webhook、Worker

Hono/webhook：使用 `app.request()` 或已有 HTTP helpers；测试 health endpoints、invalid signatures、disabled module 404s 和 idempotency。

Worker：直接测试 processor functions；除非项目已有这种模式，否则不要启动真实 worker；mock AI APIs、storage、payment、email 和 analytics；验证副作用幂等。

## 6. E2E Tests

E2E 只用于 signup/signin、第一次核心功能使用、测试模式购买/订阅或关键 admin flows。保持少量且稳定，边界情况放在更低层级测试。

## 7. AI 生成规则

必须：

- 除非项目有其他约定，否则测试放在源码旁边。
- 使用自然测试名，例如 `should reject negative credit amount`。
- public service methods 覆盖 happy path 和 edge/error tests。
- 单元测试 mock 所有外部 I/O。

禁止：

- 不测试框架内部实现。
- 不访问真实外部服务。
- 除非用户要求，不写 snapshots。
- 不硬编码当前时间；使用 fake timers。
- 不为更适合低层测试的行为添加大量 E2E。

## 8. 最终回复前

- 如果可用，运行最小相关测试命令。
- 如果没有测试命令，说明未运行测试及原因。
- 如果测试基础设施变更，实际可行时也运行 lint/typecheck。
