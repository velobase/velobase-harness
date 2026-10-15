# AI Chat

**Language:** English | [简体中文](../../../zh-CN/features/ai-chat/README.md)

Chat is an input and observation surface for Worker execution. The HTTP request accepts a run; it does not own the model or tool lifecycle.

```text
ChatPanel → POST /api/chat → transaction: input + assistant placeholder + AgentRun
                                      ↓ durable notification / recovery
                            Worker → Agent executor → model + registered tools
                                      ↓ saved UI message snapshots
ChatPanel ← GET /api/chat/:id/run ← authorized conversation projection
```

## Ownership

| Location | Responsibility |
| --- | --- |
| `src/components/ai-chat`, `src/hooks/ai-chat` | UI, polling, sending and cancellation |
| `src/server/ai-chat` | Chat admission, history projection, executor and billing binding |
| `src/server/agents` | Executor registration, claims, leases, attempts and durable tool operations |
| `src/workers` | Agent queue, processor and recovery scheduler |
| `src/server/api/tools` | Registered tools and explicit recovery guarantees |

Registration and enablement remain in `src/config/modules.ts` and `src/server/modules`. No additional runtime package is required. Existing model/provider adapters remain in use.

## Operation

Enable the included AI Chat capability and configure `OPENROUTER_API_KEY`. This host currently selects the OpenRouter adapter; keys for other providers do not make it ready. Run both Web and Worker with the same PostgreSQL and Redis configuration. Apply the additive Agent execution migration before starting them.

- Acceptance atomically saves input, a reply placeholder and a run. Repeating the same request ID and payload returns the accepted run; changing its payload is rejected.
- A conversation is a serialization target. The database permits one running claim, with an epoch fence and a 60-second lease. Recovery checks every 15 seconds and retries expired attempts at most three times.
- Each run has a cumulative 12-model-step limit, 4,096 output tokens per step, a 15-minute attempt timeout and a 24-hour expiry. A dependency wait releases the Worker and does not consume the failure retry allowance.
- The browser polls saved snapshots. Closing or reconnecting does not cancel work. Cancel is an explicit authenticated operation. Completed external actions are not rolled back.
- Branch history follows parent links. Editing creates a branch; regeneration is rejected when the replaced reply used tools. The current execution/progress window supports up to 1,000 interactions and rejects an incomplete ancestry.
- Tool operations persist identity, input and outcome. Read operations and explicitly idempotent operations can recover. An ambiguous effect stops with `TOOL_OUTCOME_UNKNOWN`; automatic re-execution and further input on that conversation are blocked pending host reconciliation.
- Image creation uses an idempotent task and short checks, then suspends while the task runs. Document writes currently use the conservative no-replay policy; their service and execution ledger are not one atomic transaction.
- Permission checks run on admission, claim, model steps, tool dispatch, checkpoints and lease renewal. Disabling AI Chat suspends accepted work; history and cancellation remain available.
- Guest ownership uses an HTTP-only cookie whose hash is stored on the conversation. Client-generated guest IDs are not credentials. Guest tools and uploads are disabled. Existing guest records without an ownership hash are not automatically claimed.
- Attachments currently support uploaded images only. The API validates ownership of the storage URL. Other formats are rejected rather than silently discarded.
- Recorded token usage is settled under an idempotent run ID. Missing usage after a crash or cancellation is marked uncertain; no provider reconciliation or estimated charge is implied.

## Boundaries

This implementation supplies the common execution path and chat adapter. It does not implement product workflows, a separate work-item system, a public schedule/webhook creation API, approval UI, automatic reconciliation of unknown effects, or cross-platform clients. Additional triggers call the same durable admission and executor contracts with their own authoritative permissions and domain transaction.

Raw provider responses and reasoning traces are not saved as diagnostic logs. Conversation messages and required tool inputs/results are application data. Private prompts, business rules and workflow implementations belong in the private product repository.

See [architecture](../../architecture/agent-runtime.md), [tool development](./development/PLUGIN_DEV.md) and [queue integration](../../integrations/queue/README.md).
