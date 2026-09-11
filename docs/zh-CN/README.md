# Velobase Harness 文档

从[应用入口](./modules/getting-started.md)、[功能目录](./modules/catalog.md)或[模块接入](./modules/composition.md)开始。

**语言:** [English](../en/README.md) | 简体中文

本目录是 Velobase Harness 的中文文档入口。英文 canonical 文档位于 `docs/en/**`。

## 从这里开始

| 文档                                                           | 用途                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [AI 领域设计指南](./ai/design.md)                              | **阶段零** — 产品理解、领域建模、MVP scope 确认、Schema 和 API 设计（写代码之前） |
| [框架指南](../../FRAMEWORK_GUIDE.zh-CN.md)                     | 架构、本地启动、代码边界、模块系统、生产 Checklist                                |
| [集成指南](./integrations/README.md)                           | 第三方集成如何组织，以及 AI 如何安全扩展                                          |
| [AI 测试指南](./ai/testing.md)                                 | 测试策略、分层模式（单元 / 集成 / E2E）、AI 生成测试规范                          |
| [AI 完成检查清单](./ai/completion-checklist.md)                | commit、push 或部署前的必要自检                                                   |
| [Web/API/Worker 拆分](./architecture/web-api-service-split.md) | 运行时拆分、`SERVICE_MODE`、Docker、Kubernetes 和部署模式                         |
| [AI Agent 规则](../../AGENTS.zh-CN.md)                         | AI Agent 修改代码前必须阅读的稳定规则                                             |

## 参考区域

| 区域         | 当前位置                                                                   |
| ------------ | -------------------------------------------------------------------------- |
| Cloud 部署   | [./deployment/cloud-deploy.md](./deployment/cloud-deploy.md)               |
| API 约定     | [./conventions/api.md](./conventions/api.md)                               |
| Debug 流程   | [./debugging/online-local-debug.md](./debugging/online-local-debug.md)     |
| 第三方集成   | [./integrations/](./integrations/)                                         |
| 内置功能     | [./features/](./features/)                                                 |
| 产品模块     | [./modules/README.md](./modules/README.md)                                 |
| 模块示例     | [../../src/modules/example/README.md](../../src/modules/example/README.md) |
| AI Chat 模块 | [./modules/ai-chat/README.md](./modules/ai-chat/README.md)                 |

## 文档规则

- 根目录 `README.md` 保持英文默认入口，`README.zh-CN.md` 作为中文入口。
- 英文 canonical 文档放在 `docs/en/**`，中文镜像放在 `docs/zh-CN/**`。
- 不翻译命令、环境变量、文件路径、包名、API 名称和代码块。
- 如果某个文档路径被 Velobase Cloud Launchpad Prompt 引用，修改文档结构时必须同步修改 Cloud 的 Prompt Generator。
