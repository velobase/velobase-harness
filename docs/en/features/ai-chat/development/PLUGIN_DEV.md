# Register tools

Register tool groups through `toolRegistry` at host startup, and list permitted groups in the Agent configuration. Factories receive trusted actor, project and conversation context. Validate model-supplied parameters with Zod and enforce ownership in the called service.

Recovery is explicit via `registerToolRecovery` in `src/server/agents/tools.ts`:

- `read`: repetition has no side effect.
- `idempotent`: the owning service deduplicates the persisted operation identity, including after a process crash.
- `once` (default): an operation that may have started is never blindly replayed. An ambiguous result blocks the run until reconciled.

The executor passes the stable operation ID as the underlying tool's `toolCallId`, and also provides `experimental_context.operationId` and `runId`. Use the operation identity as the provider idempotency key or transactional deduplication key. A process-local cache is not an idempotency guarantee.

Long-running tools should return serializable `{ pending: true, ... }` data after durable task creation, and use the same identity to check that task during recovery. Recovery must not create another task.

Tool result renderers register in `src/components/ai-chat/setup-renderers.ts`. Renderer selection does not grant permission to execute tools. Keep non-public tools and prompts in their private repository.
