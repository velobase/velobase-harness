# AI chat execution module (`@velobase/ai-chat`)

`@velobase/ai-chat` executes durable agent conversations using `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, `@earendil-works/pi-schema`, `@earendil-works/chord`, PostgreSQL (`pg`), and Zod.

It provides:

- `PostgresStorage` / `openPostgresStorage(pool, options)`: a conformant PostgreSQL `Storage` implementation for `@earendil-works/pi-durable` storing conversations, entries, tasks, submissions, and documents in the dedicated `pi_durable` schema.
- `runDurableChat(options)`: executes a conversation turn through Pi Durable's `Harness` over a `Storage` backend, projecting streaming partial generations (`pi.live`), tool calls, and tool results into host `UIMessage` parts.
- `ToolRegistry`, `defineChatTool` (`tool`), and `filterUnsupportedToolCalls`: browser-safe tool and UI message helpers in `@velobase/ai-chat/tools`.

`@velobase/ai-chat-openrouter` constructs an explicit Pi AI OpenRouter model adapter; another host can supply another Pi AI provider implementation.

`runDurableChat` requires an explicitly constructed model adapter and storage backend and has no string fallback to a global gateway.

Include `aiChatFeature.id` in deployment membership, expose selected model configuration readiness and check the persisted Admin switch before admitting a turn.

Use `ToolRegistry` per host composition. Explicitly register tool groups, then call `prepare(selectedGroupNames, authenticatedContext)`. Missing groups are omitted; duplicate tool/group names are rejected rather than silently replacing an executor.

`filterUnsupportedToolCalls` handles both static and dynamic tool parts when a selected agent has different tools. Keep tool authorization and durable side-effect identity in the selected business tool implementation.

Default library limits are 10 steps and 4096 output tokens. The Harness Worker enforces a cumulative 12-step run budget with 4096 output tokens per step.

## Existing application binding

The Harness [chat executor](../../src/server/ai-chat/executor.ts) selects its model through the OpenRouter Pi adapter, opens `PostgresStorage` over the shared `pg` pool (`src/server/ai-chat/database.ts`), runs in the Worker, checkpoints interaction parts, records usage and uses the execution lease's abort signal.

Its [tool composition](../../src/server/api/tools/index.ts) selects document and image tools.

Agent enrollment, ownership, guest policy, attachments, history, billing and response persistence remain explicit host responsibilities.

Packages are workspace sources, not published npm releases.
