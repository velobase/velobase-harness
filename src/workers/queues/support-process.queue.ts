import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Support Process Queue
 *
 * AI 处理队列：消费 OPEN 状态的工单，进行分类和生成回复。
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const SUPPORT_PROCESS_QUEUE_NAME = "support-process";

export interface SupportProcessJobData {
  type: "process-ticket";
  ticketId: string;
}

export const supportProcessQueue = new Queue<SupportProcessJobData>(
  SUPPORT_PROCESS_QUEUE_NAME,
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  },
);
