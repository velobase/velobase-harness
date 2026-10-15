# AI Chat implementation

See the [capability guide](./README.md) for current behavior and limits.

The request adapter is `src/app/api/chat/route.ts`. It calls `src/server/ai-chat/admission.ts`, which accepts messages and a run in the same transaction. `src/server/ai-chat/executor.ts` implements the shared Agent executor contract. The Worker processor registers that executor and dispatches or recovers runs.

`src/server/agents/service.ts` owns execution claims and cancellation; `src/server/agents/tools.ts` owns tool recovery policy. UI snapshots remain ordinary SDK message parts in `Interaction`; the observer does not need a provider stream connection.

Private products integrate their own executors, tools and domain acceptance services in their private repository. Registration does not require a directory template or a new package.
