# Velobase Gateway Integration

Velobase Gateway is an optional OpenAI-compatible model gateway integration for Velobase Harness. It is separate from the existing Velobase billing ledger integration: the ledger SDK manages credits for work the app prices itself, while the gateway routes LLM calls and meters each call to an end-customer wallet.

Harness does not become a gateway or reverse proxy. Product code gets a server-side wrapper for calling Velobase Gateway as a third-party provider, similar to how an app would wrap Bedrock, OpenRouter, or another model platform.

Official Velobase references:

- [Introduction](https://docs.velobase.io/)
- [Quickstart](https://docs.velobase.io/quickstart)
- [OpenAI-compatible Gateway](https://docs.velobase.io/integration/openai-compatible)

## Architecture

Layers:

- Provider wrapper: `src/server/ai/velobase-gateway/client.ts`
- Public exports: `src/server/ai/velobase-gateway/index.ts`
- Module registration: `src/server/modules/velobase-gateway.ts`
- Diagnostics API: `src/server/api/routers/integration-diagnostics.ts`
- Dashboard smoke test: `src/components/dashboard/llm-tests/velobase-gateway-test-panel.tsx`

Business modules should call `@/server/ai/velobase-gateway` and should not construct raw Velobase Gateway HTTP calls in product code.

## Configuration

The gateway can reuse the existing billing key:

```env
VELOBASE_API_KEY=vb_live_...
VELOBASE_GATEWAY_MODE=auto
```

Use a dedicated key only when the gateway should not share `VELOBASE_API_KEY`:

```env
VELOBASE_GATEWAY_API_KEY=vb_live_...
```

Required for module enablement:

- `VELOBASE_GATEWAY_API_KEY` or `VELOBASE_API_KEY`

Optional settings:

- `VELOBASE_GATEWAY_MODE=auto|off|on`, default `auto`
- `VELOBASE_GATEWAY_BASE_URL`, default `https://api.velobase.io/v1`
- `VELOBASE_GATEWAY_DEFAULT_MODEL`, default `deepseek/deepseek-v4-pro`
- `VELOBASE_GATEWAY_TEST_CUSTOMER_ID`, optional dashboard chat smoke-test override; otherwise the signed-in user id is used
- `VELOBASE_GATEWAY_REQUEST_TIMEOUT_MS`, default `30000`

Project keys (`vb_live_...`) are server-side keys and require `X-Velobase-Customer` on model calls. Customer-scoped keys (`vb_customer_...`) carry their own customer binding and do not require that header.

## Public Service

For AI SDK usage:

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

For a simple server-side smoke call that also returns Velobase billing headers:

```ts
import { runVelobaseGatewayChatTest } from "@/server/ai/velobase-gateway";

const result = await runVelobaseGatewayChatTest({
  customerId: user.id,
  model: "deepseek/deepseek-v4-pro",
  prompt: "Reply with one short sentence.",
});

console.log(result.billing.transactionId);
```

Use `listVelobaseGatewayModels()` to validate credentials and inspect routeable model ids.

## Billing Boundary

Velobase Gateway model calls are metered by Velobase and return billing details through response headers such as `x-velobase-cost-cents`, `x-velobase-cost-credits`, `x-velobase-balance-credits`, and `x-velobase-transaction-id`.

Do not also run an app-side `postConsume()` for the same model call unless you intentionally want a separate product charge. When adapting AI Chat to use Velobase Gateway, choose one billing path for that turn: gateway metering or explicit Harness ledger deduction.

## Dashboard Smoke Test

Admins can validate the integration from `/dashboard`: open **Module Status**, then click the green **Velobase Gateway** module to open its test dialog.

The panel performs two checks:

- Provider connection: calls `GET /v1/models` through the wrapper to confirm the key and base URL work.
- Chat smoke test: calls `POST /v1/chat/completions` with a small prompt and shows the assistant response, token usage, and Velobase billing headers.

For project keys, the dashboard defaults `X-Velobase-Customer` to the signed-in user id. You can override it in the panel or configure `VELOBASE_GATEWAY_TEST_CUSTOMER_ID`. A model call can fail with `customer not found` if that user has not been created or funded in Velobase, or with `402 insufficient_funds` when either the customer wallet or the project wallet lacks balance.

## Testing

Use the dashboard smoke test after configuring a Velobase key.

Recommended manual path:

1. Set `VELOBASE_API_KEY` or `VELOBASE_GATEWAY_API_KEY`.
2. Set `VELOBASE_GATEWAY_MODE=auto`.
3. Start Web with `pnpm dev`.
4. Sign in as an admin and open `/dashboard`.
5. In **Module Status**, click the green **Velobase Gateway** module.
6. Click **List models**.
7. Confirm the current user customer id, or override it with a funded customer id, then run **Run chat test**.

For code changes, run the normal quality checks from `docs/en/ai/completion-checklist.md`.

## AI Rules

- Keep Gateway calls server-side; never expose project keys to client code.
- Validate customer ids, prompts, and model ids with Zod at API boundaries.
- Use the wrapper in `@/server/ai/velobase-gateway` instead of raw `fetch` calls in product modules.
- Do not log API keys or full provider responses that may contain sensitive data.
- Keep Gateway metering distinct from explicit billing ledger deductions to avoid accidental double charging.
