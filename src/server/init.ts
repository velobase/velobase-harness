/**
 * Runtime Initialization — 运行时一次性初始化入口
 *
 * 由 instrumentation.ts（Next.js 启动时）或 standalone.ts（SERVICE_MODE 启动时）调用。
 * 集中注册所有需要在服务启动时执行的逻辑，避免 route 文件产生顶层副作用。
 */
import { createLogger } from "@/lib/logger";

const log = createLogger("init");
let initialized = false;

export async function initRuntime() {
  if (initialized) return;
  initialized = true;

  log.info("Initializing runtime services...");

  await initToolRegistry();
  await initPluggableModules();

  log.info("Runtime initialization complete");
}

async function initPluggableModules() {
  const { initModules } = await import("@/server/modules");
  await initModules();
}

async function initToolRegistry() {
  const { registerBuiltinTools } = await import("@/server/api/tools");
  registerBuiltinTools();
}
