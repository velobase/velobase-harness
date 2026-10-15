# Capability registration

**Language:** English | [简体中文](../../zh-CN/modules/README.md)

The registry declares capabilities, enablement and contributions. It does not require a matching source directory or package. Implementation stays with its UI, service and Worker owners.

- [Start Harness](./getting-started.md)
- [Capability catalog](./catalog.md)
- [Composition and operation](./composition.md)
- [AI Chat](../features/ai-chat/README.md)
- [Adding a capability](../ai/new-module.md)

Use `src/config/modules.ts` and `src/server/modules` for registration. Keep private product behavior in its private repository. Extract packages only when a real dependency boundary is needed.
