# AI chat execution module

`@velobase/ai-chat` extracts the existing tool registry, message/tool compatibility filtering and streaming execution from the complete example.

It uses the provider-neutral AI SDK and Zod.

It has no OpenRouter adapter, Prisma, Redis, billing, mailbox, image-generation or host env dependency.

The AI SDK itself includes gateway support as a transitive dependency; this module requires an explicitly constructed model object and never selects that gateway through a string model fallback.

`@velobase/ai-chat-openrouter` constructs an OpenRouter model; another host can supply another AI SDK model implementation.

`streamChat` requires a constructed model object and has no string fallback to a global gateway.

Include `aiChatFeature.id` in deployment membership, expose selected model configuration readiness and check the persisted Admin switch before admitting a turn.

Use `ToolRegistry` per host composition.

Explicitly register tool groups, then call `prepare(selectedGroupNames, authenticatedContext)`.

It does not load built-in tools.

Missing groups are omitted; duplicate tool/group names are rejected rather than silently replacing an executor.

`filterUnsupportedToolCalls` handles both static and dynamic tool parts when a selected agent has different tools.

Keep tool authorization and durable side-effect identity in the selected business tool implementation.

Call `streamChat({model,messages,tools,system,maxSteps,maxOutputTokens,abortSignal,providerOptions})`.

The result retains the AI SDK stream-response and usage APIs, including `toUIMessageStreamResponse`, custom message ids, reasoning parts and final persistence callbacks.

Default limits are 10 steps and 4096 output tokens; the complete example explicitly retains its 50-step/50000-token policy.

Model retries are disabled; side-effecting tool retries must use the originating business request identity.

## Existing application binding

The complete example's [stream service](../../src/modules/ai-chat/server/services/stream.service.ts) selects its model through the independent OpenRouter adapter, keeps interaction ids/persistence and optional credits settlement, and passes the request abort signal.

Its [tool composition](../../src/server/api/tools/index.ts) selects document and image tools.

Title generation uses the same selected technical adapter, while title prompts and database writes remain host policies.

This extraction does not replace the complete example's conversation/interaction schema or its rich Web UI.

Agent enrollment, ownership, guest policy, attachments, history, billing and response persistence remain explicit host responsibilities.

The complete example supplies that binding.

No tests, type checks, builds, application runs or model calls were executed during this change.

Packages are workspace sources, not published npm releases.
