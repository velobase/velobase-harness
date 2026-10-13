import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Support Sync Queue
 *
 * 邮件同步队列：定时从 IMAP 拉取新邮件，创建/更新工单。
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const SUPPORT_SYNC_QUEUE_NAME = "support-sync";

export interface SupportSyncJobData {
  type: "scheduled-scan";
}

export const supportSyncQueue = new Queue<SupportSyncJobData>(
  SUPPORT_SYNC_QUEUE_NAME,
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  },
);
