# 产品模块

**语言:** [English](../../en/modules/README.md) | 简体中文

产品模块位于 `src/modules/<name>/`。这里适合放产品特定行为、可复用 UI、产品 service 和模块本地文档。

## 可选业务能力

- [启动 Harness](./getting-started.md)
- [业务与技术能力目录](./catalog.md)
- [接入和运营模块](./composition.md)

## 模块

| 模块                                               | 用途                                         |
| -------------------------------------------------- | -------------------------------------------- |
| [AI Chat](./ai-chat/README.md)                     | 流式聊天、Agent 配置、工具调用和聊天 UI 底座 |
| [示例模块](../../../src/modules/example/README.md) | 添加产品特定模块时可参考的目录结构           |

## 规则

- 框架级通用服务放在 `src/server/**`。
- 产品特定行为放在 `src/modules/<name>/`。
- 模块本地文档说明实现细节，`docs/zh-CN/modules/**` 说明面向框架使用者的模块能力。
