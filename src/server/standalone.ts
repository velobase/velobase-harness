/**
 * Standalone Entry Point — SERVICE_MODE-driven multi-service launcher
 *
 * Reads `SERVICE_MODE` from the environment and starts the selected services
 * within a single Node.js process:
 *
 *   SERVICE_MODE=web,worker (default) — Web :3000 + Worker :3001
 *   SERVICE_MODE=all        — Web :3000 + API :3002 + Worker :3001
 *   SERVICE_MODE=web        — Next.js only
 *   SERVICE_MODE=api        — Hono API only
 *   SERVICE_MODE=worker     — BullMQ Worker only
 *   SERVICE_MODE=web,api    — any comma-separated combination
 *
 * Each service exposes a `shutdown()` function. On SIGTERM / SIGINT the
 * process tears them all down gracefully.
 */
import "dotenv/config";

import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { redis } from "@/server/redis";

const log = createLogger("standalone");

const SERVICE_MODE = env.SERVICE_MODE;
const modes = SERVICE_MODE.split(",").map((m) => m.trim().toLowerCase());

function shouldStart(service: string): boolean {
  return modes.includes("all") || modes.includes(service);
}

const shutdowns: Array<() => Promise<void>> = [];

function logResourceStatus() {
  const mask = (v?: string) => v ? "configured" : "NOT SET";
  const resources = {
    DATABASE_URL: mask(env.DATABASE_URL),
    REDIS: env.REDIS_URL
      ? "URL mode"
      : env.REDIS_HOST
        ? `HOST mode (${env.REDIS_HOST}:${env.REDIS_PORT ?? 6379})`
        : "NOT SET",
    STORAGE: env.STORAGE_BUCKET
      ? `${env.STORAGE_PROVIDER} / ${env.STORAGE_BUCKET}`
      : "NOT SET",
    AUTH_SECRET: mask(env.AUTH_SECRET),
    APP_URL: env.APP_URL ?? "NOT SET",
  };
  log.info(resources, "Resource status");
}

async function start() {
  log.info({ SERVICE_MODE, modes }, "Starting services...");
  logResourceStatus();

  if (shouldStart("web")) {
    const { startWeb } = await import("@/web/start");
    const { shutdown } = await startWeb();
    shutdowns.push(shutdown);
  }

  if (shouldStart("api")) {
    const { startApi } = await import("@/api/start");
    const { shutdown } = await startApi();
    shutdowns.push(shutdown);
  }

  if (shouldStart("worker")) {
    const { startWorker } = await import("@/workers/start");
    const { shutdown } = await startWorker();
    shutdowns.push(shutdown);
  }

  log.info({ modes }, "All requested services started");
}

async function shutdown(signal: string) {
  log.info({ signal }, "Received shutdown signal, stopping services...");
  for (const fn of shutdowns) {
    try {
      await fn();
    } catch (err) {
      log.error({ error: err }, "Error during service shutdown");
    }
  }
  try {
    await redis.quit();
    log.info("Redis connection closed");
  } catch {}
  process.exit(0);
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

void start();
