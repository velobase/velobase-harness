import { trace } from "@opentelemetry/api";
import { initTelemetry, shutdownTelemetry } from "../index";
import { createWorkerInstance } from "@/workers/utils/create-worker";
import { redis } from "@/server/redis";

await initTelemetry("worker");
const queueName = process.argv[2];
if (!queueName) throw new Error("Missing test queue name");
const worker = createWorkerInstance(queueName, async () => {
  process.send?.({ traceId: trace.getActiveSpan()?.spanContext().traceId });
});
await worker.waitUntilReady();
process.send?.({ ready: true });
process.once("SIGTERM", () => {
  void (async () => {
    await worker.close();
    await redis.quit();
    await shutdownTelemetry();
    process.exit(0);
  })();
});
