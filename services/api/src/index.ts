/**
 * API Service Entry Point (standalone process)
 *
 * Used by `api:dev` and `api:prod` scripts. When API is enabled inside
 * `src/server/standalone.ts`, that launcher calls `startApi()` directly
 * instead of this file.
 */
import "dotenv/config";

import { startApi } from "../../../src/api/start";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:main");

let apiHandle: Awaited<ReturnType<typeof startApi>> | undefined;

async function main() {
  log.info("Starting API service...");
  apiHandle = await startApi();
}

async function shutdown(signal: string) {
  log.info({ signal }, "Received shutdown signal");
  try {
    await apiHandle?.shutdown();
    process.exit(0);
  } catch (err) {
    log.error({ error: err }, "Error during shutdown");
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
