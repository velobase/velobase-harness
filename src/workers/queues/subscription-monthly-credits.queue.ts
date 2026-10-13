import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Subscription Monthly Credits Queue
 *
 * 订阅按月积分发放队列（主要用于年度订阅拆分为月度积分）
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export interface SubscriptionMonthlyCreditsJobData {
  type: "scheduled-scan";
}

export const subscriptionMonthlyCreditsQueue =
  new Queue<SubscriptionMonthlyCreditsJobData>("subscription-monthly-credits", {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
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
  });
