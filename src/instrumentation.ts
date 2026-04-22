/**
 * Next.js Instrumentation — 服务端启动时执行一次
 *
 * 用于注册运行时初始化逻辑（Lark handler、Tool registry 等），
 * build 期间不执行，因此可以安全 import 依赖 DB/Redis 的模块。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initRuntime } = await import("./server/init");
    await initRuntime();
  }
}
