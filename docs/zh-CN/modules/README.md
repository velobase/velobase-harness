# 能力注册

**语言：** [English](../../en/modules/README.md) | 简体中文

注册机制声明能力、启停条件和贡献项，不要求每项能力都有对应目录或独立包。实现留在已有界面、服务和 Worker 职责目录。

- [启动 Harness](./getting-started.md)
- [能力目录](./catalog.md)
- [组合与运维](./composition.md)
- [AI Chat](../features/ai-chat/README.md)
- [添加能力](../ai/new-module.md)

注册继续使用 `src/config/modules.ts` 和 `src/server/modules`。私有产品行为留在私有仓库，只有实际需要独立依赖边界时才拆包。
