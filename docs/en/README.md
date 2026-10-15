# Velobase Harness Documentation

Start with [application choices](./modules/getting-started.md), the [capability catalog](./modules/catalog.md), or [module composition](./modules/composition.md).

**Language:** English | [Simplified Chinese](../zh-CN/README.md)

This directory is the English canonical documentation entry for Velobase Harness. Simplified Chinese mirrors live under `docs/zh-CN/**`.

## Start Here

| Document                                                        | Purpose                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [AI Domain Design Guide](./ai/design.md)                        | **Phase 0** — product understanding, domain modeling, MVP scope confirmation, schema & API design before coding |
| [Framework Guide](../../FRAMEWORK_GUIDE.md)                     | Architecture, local startup, code boundaries, module system, and production checklist                           |
| [Integration Guide](./integrations/README.md)                   | How third-party integrations are organized and how AI should extend them                                        |
| [AI Testing Guide](./ai/testing.md)                             | Test strategy, layered patterns (unit / integration / E2E), and AI test generation rules                        |
| [AI Completion Checklist](./ai/completion-checklist.md)         | Required self-check before commit, push, or deployment                                                          |
| [Web/API/Worker Split](./architecture/web-api-service-split.md) | Runtime split, `SERVICE_MODE`, Docker, Kubernetes, and deployment modes                                         |
| [Agent Runtime Design](./architecture/agent-runtime.md) | Proposal for execution contracts, tools, triggers, recovery and optional observation UI |
| [AI Agent Rules](../../AGENTS.md)                               | Stable rules that AI agents must read before editing code                                                       |

## Reference Areas

| Area               | Current location                                                           |
| ------------------ | -------------------------------------------------------------------------- |
| Cloud deployment   | [./deployment/cloud-deploy.md](./deployment/cloud-deploy.md)               |
| API conventions    | [./conventions/api.md](./conventions/api.md)                               |
| Debugging workflow | [./debugging/online-local-debug.md](./debugging/online-local-debug.md)     |
| Integrations       | [./integrations/](./integrations/)                                         |
| Built-in features  | [./features/](./features/)                                                 |
| Capability registration    | [./modules/README.md](./modules/README.md)                                 |
| AI Chat     | [./features/ai-chat/README.md](features/ai-chat/README.md)                 |

## Documentation Rules

- Keep `README.md` as the English default and `README.zh-CN.md` as the Chinese root entry.
- Keep English canonical docs under `docs/en/**` and Simplified Chinese mirrors under `docs/zh-CN/**`.
- Do not translate commands, environment variables, file paths, package names, API names, or code blocks.
- When a documentation path is used by Velobase Cloud Launchpad prompts, update the prompt generator in the Cloud repository in the same change.
