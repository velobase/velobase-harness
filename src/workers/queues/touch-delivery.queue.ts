import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Touch Delivery Queue
 *
 * 触达计划执行队列：定时扫描 DB 的 TouchSchedule，发送到期触达并写入 TouchRecord。
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const TOUCH_DELIVERY_QUEUE_NAME = "touch-delivery";

export interface TouchDeliveryJobData {
  type: "scheduled-scan";
}

export const touchDeliveryQueue = new Queue<TouchDeliveryJobData>(
  TOUCH_DELIVERY_QUEUE_NAME,
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
