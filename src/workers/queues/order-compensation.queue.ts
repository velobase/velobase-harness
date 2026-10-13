import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Order Compensation Queue
 *
 * 订单回调补偿队列，处理 webhook 丢失的情况
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export interface OrderCompensationJobData {
  type: "scheduled-scan" | "manual-check";
  paymentId?: string;
}

export const orderCompensationQueue = new Queue<OrderCompensationJobData>(
  "order-compensation",
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: {
        count: 50,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 200,
        age: 7 * 24 * 3600, // 7 days
      },
    },
  },
);
