import { queueTelemetry } from "@/server/telemetry/queue";
import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import { createLogger } from "@/lib/logger";

export const STALE_JOB_CLEANUP_QUEUE_NAME = "stale-job-cleanup";

export interface StaleJobCleanupJobData {
  type: "scheduled-scan";
}

export const staleJobCleanupQueue = new Queue<StaleJobCleanupJobData>(
  STALE_JOB_CLEANUP_QUEUE_NAME,
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: {
        age: 24 * 3600,
        count: 100,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  },
);

const logger = createLogger("queue:stale-job-cleanup");

staleJobCleanupQueue.on("error", (err) => {
  logger.error({ err }, "Stale job cleanup queue error");
});
