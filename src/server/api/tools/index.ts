import { toolRegistry } from "./registry";
import { createDocumentTools } from "./document-tools";

/**
 * 注册所有内置工具
 *
 * 此函数由 src/server/init.ts 在运行时调用（通过 instrumentation.ts 或 standalone.ts），
 * 而非模块顶层执行，避免 next build 期间触发 import 链上的副作用。
 */
export function registerBuiltinTools() {
  if (toolRegistry.has("document_tools")) return;

  toolRegistry.register({
    name: "document_tools",
    description: "项目文档操作工具集（列出、读取、创建/更新文档）",
    factory: createDocumentTools,
  });
}

export { toolRegistry } from "./registry";
export { createDocumentTools } from "./document-tools";
export type { ToolContext, ToolConfig, ToolFactory } from "./registry";
