/**
 * Worker Entry Point (standalone process)
 *
 * Used by `worker:dev` and `worker:prod` scripts. When running inside
 * SERVICE_MODE=all, `src/server/standalone.ts` calls `startWorker()` directly
 * instead of this file.
 */
import "dotenv/config";

import { startWorker } from "./start";
import { redis } from "@/server/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("worker:main");

let workerHandle: Awaited<ReturnType<typeof startWorker>> | undefined;

async function main() {
  log.info("Starting Worker service...");
  workerHandle = await startWorker();
}

async function shutdown(signal: string) {
  log.info({ signal }, "Received shutdown signal");
  try {
    await workerHandle?.shutdown();
    await redis.quit();
    log.info("Redis connection closed");
    process.exit(0);
  } catch (error) {
    log.error({ error }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  log.fatal({ error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.fatal({ reason }, "Unhandled rejection");
  process.exit(1);
});

void main();
