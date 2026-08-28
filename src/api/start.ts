/**
 * API Service Starter
 *
 * Exports `startApi()` which can be called either:
 *  - from `src/api/index.ts` (standalone API process)
 *  - from `src/server/standalone.ts` when SERVICE_MODE includes api/all
 *
 * Returns a `shutdown` function for graceful termination.
 */
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApiApp } from "./app";
import { createLogger } from "@/lib/logger";
import { env } from "@/env";

const log = createLogger("api");

export interface ApiHandle {
  server: ServerType;
  shutdown: () => Promise<void>;
}

export async function startApi(): Promise<ApiHandle> {
  const port = env.API_PORT;
  const app = createApiApp();

  const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    log.info({ port }, `API server listening on port ${port}`);
    log.info("Health check: /health");
  });

  const shutdown = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          log.error({ error: err }, "Error closing API server");
          reject(err);
        } else {
          log.info("API server closed");
          resolve();
        }
      });
    });

  return { server, shutdown };
}
