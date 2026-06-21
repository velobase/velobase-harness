# Velobase Gateway 集成

Velobase Gateway 是 Velobase Harness 的可选 OpenAI-compatible 大模型中转站集成。它和已有的 Velobase billing ledger 集成是两层能力：ledger SDK 用于应用自己定价的积分记账，gateway 用于转发 LLM 调用并把每次模型调用计量到终端客户钱包。

Harness 本身不会变成中转站或反向代理。产品代码获得的是服务端 provider 封装，用法接近 Bedrock、OpenRouter 或其他模型平台的接入封装。

官方 Velobase 文档：

- [Introduction](https://docs.velobase.io/)
- [Quickstart](https://docs.velobase.io/quickstart)
- [OpenAI-compatible Gateway](https://docs.velobase.io/integration/openai-compatible)

## 架构

分层：

- Provider 封装：`src/server/ai/velobase-gateway/client.ts`
- 公开导出：`src/server/ai/velobase-gateway/index.ts`
- 模块注册：`src/server/modules/velobase-gateway.ts`
- Diagnostics API：`src/server/api/routers/integration-diagnostics.ts`
- Dashboard 冒烟测试：`src/components/dashboard/llm-tests/velobase-gateway-test-panel.tsx`

业务模块应调用 `@/server/ai/velobase-gateway`，不要在产品代码中手写 Velobase Gateway HTTP 请求。

## 配置

Gateway 默认可以复用已有 billing key：

```env
VELOBASE_API_KEY=vb_live_...
VELOBASE_GATEWAY_MODE=auto
```

只有当 Gateway 需要和 billing 使用不同 key 时，才配置独立 key：

```env
VELOBASE_GATEWAY_API_KEY=vb_live_...
```

模块启用所需配置：

- `VELOBASE_GATEWAY_API_KEY` 或 `VELOBASE_API_KEY`

可选配置：

- `VELOBASE_GATEWAY_MODE=auto|off|on`，默认 `auto`
- `VELOBASE_GATEWAY_BASE_URL`，默认 `https://api.velobase.io/v1`
- `VELOBASE_GATEWAY_DEFAULT_MODEL`，默认 `deepseek/deepseek-v4-pro`
- `VELOBASE_GATEWAY_TEST_CUSTOMER_ID`，可选的 Dashboard 聊天冒烟测试覆盖值；未配置时使用当前登录用户 ID
- `VELOBASE_GATEWAY_REQUEST_TIMEOUT_MS`，默认 `30000`

Project key（`vb_live_...`）只能在服务端使用，模型调用需要传 `X-Velobase-Customer`。Customer-scoped key（`vb_customer_...`）自带 customer 绑定，不需要该 header。

## 公开服务

AI SDK 用法：

```ts
import { streamText } from "ai";
import { createVelobaseGatewayChatModel } from "@/server/ai/velobase-gateway";

const result = streamText({
  model: createVelobaseGatewayChatModel("deepseek/deepseek-v4-pro", {
    customerId: user.id,
  }),
  messages: [{ role: "user", content: "Say hello in one sentence." }],
});
```

如果只需要服务端冒烟调用，并读取 Velobase billing headers：

```ts
import { runVelobaseGatewayChatTest } from "@/server/ai/velobase-gateway";

const result = await runVelobaseGatewayChatTest({
  customerId: user.id,
  model: "deepseek/deepseek-v4-pro",
  prompt: "Reply with one short sentence.",
});

console.log(result.billing.transactionId);
```

使用 `listVelobaseGatewayModels()` 可以验证凭证并查看可路由模型 ID。

## 计费边界

Velobase Gateway 模型调用由 Velobase 计量，并通过 `x-velobase-cost-cents`、`x-velobase-cost-credits`、`x-velobase-balance-credits`、`x-velobase-transaction-id` 等响应头返回计费信息。

不要对同一次模型调用再执行应用侧 `postConsume()`，除非你明确想增加一笔独立产品收费。如果后续把 AI Chat 切到 Velobase Gateway，每一轮调用应只选择一种计费路径：Gateway 自动计量，或 Harness 显式 ledger 扣费。

## Dashboard 冒烟测试

管理员可以在 `/dashboard` 验证该集成：打开 **模块状态**，点击变绿的 **Velobase Gateway** 模块后会出现测试弹窗。

面板提供两项检查：

- Provider connection：通过封装调用 `GET /v1/models`，确认 key 和 base URL 可用。
- Chat smoke test：调用 `POST /v1/chat/completions`，展示模型回复、token usage 和 Velobase billing headers。

使用 project key 时，Dashboard 默认把当前登录用户 ID 作为 `X-Velobase-Customer`。你也可以在面板里覆盖，或配置 `VELOBASE_GATEWAY_TEST_CUSTOMER_ID`。如果该用户还没有在 Velobase 中创建或充值，模型调用会返回 `customer not found`；如果 customer wallet 或 project wallet 余额不足，则会返回 `402 insufficient_funds`。

## 测试

配置 Velobase key 后，用 Dashboard 冒烟测试做手动验证。

推荐路径：

1. 配置 `VELOBASE_API_KEY` 或 `VELOBASE_GATEWAY_API_KEY`。
2. 配置 `VELOBASE_GATEWAY_MODE=auto`。
3. 用 `pnpm dev` 启动 Web。
4. 以管理员身份登录并打开 `/dashboard`。
5. 在 **模块状态** 中点击变绿的 **Velobase Gateway** 模块。
6. 点击 **列出模型**。
7. 确认当前用户 customer id，或覆盖为一个有余额的 customer id，然后运行 **运行聊天测试**。

代码变更完成后，按 `docs/en/ai/completion-checklist.md` 运行常规质量检查。

## AI 规则

- Gateway 调用保持在服务端；不要把 project key 暴露给客户端。
- 在 API 边界用 Zod 校验 customer id、prompt 和 model id。
- 产品模块通过 `@/server/ai/velobase-gateway` 调用封装，不直接写 raw `fetch`。
- 不记录 API key，也不要把可能包含敏感信息的完整 provider response 打到日志。
- 区分 Gateway 计量和显式 billing ledger 扣费，避免重复扣费。
