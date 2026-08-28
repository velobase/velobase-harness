/**
 * Worker Service Starter
 *
 * Exports `startWorker()` which can be called either:
 *  - from `src/workers/index.ts` (standalone worker process)
 *  - from `src/server/standalone.ts` when SERVICE_MODE includes worker/all
 *
 * Returns a `shutdown` function for graceful termination.
 */
import {
  collectDisabledSchedulerContributions,
  collectEnabledWorkerContributions,
  MODULE_STATES,
} from "@/config/modules";
import { createLogger } from "@/lib/logger";
import { WorkerRegistry } from "./registry";
import { createServer } from "./server";
import { getPlatformWorkerContributions } from "./platform";
import { env } from "@/env";

const log = createLogger("worker");

export interface WorkerHandle {
  registry: WorkerRegistry;
  shutdown: () => Promise<void>;
}

export async function startWorker(): Promise<WorkerHandle> {
  const port = env.WORKER_PORT;

  const registry = new WorkerRegistry();

  registry.registerContributions(getPlatformWorkerContributions());

  const moduleWorkerContributions = await collectEnabledWorkerContributions();
  const disabledSchedulers = await collectDisabledSchedulerContributions();
  registry.registerContributions(moduleWorkerContributions);

  const server = await createServer(registry.getQueues());
  await server.listen({ port, host: "0.0.0.0" });
  await registry.startAll(disabledSchedulers);

  log.info(
    {
      modules: MODULE_STATES.map((state) => ({
        id: state.id,
        mode: state.mode,
        enabled: state.enabled,
        reason: state.reason,
      })),
    },
    "Module states resolved",
  );
  log.info({ port }, `Worker ready - HTTP server listening on port ${port}`);
  log.info("Bull Board UI: /_worker/queues");
  log.info("Health check: /health and /healthz");

  const shutdown = async () => {
    await registry.shutdown();
    await server.close();
    log.info("Worker HTTP server closed");
  };

  return { registry, shutdown };
}
