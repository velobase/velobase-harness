import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Subscription Compensation Queue
 *
 * 订阅续费 / 提前转正补偿队列，用于兜底 webhook 失败导致
 * - 未创建新的 REGULAR 周期
 * - 未发放对应会员积分
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export interface SubscriptionCompensationJobData {
  type: "scheduled-scan" | "manual-check";
  /**
   * 可选：指定单个 userSubscription.id 做手动补偿
   */
  subscriptionId?: string;
}

export const subscriptionCompensationQueue =
  new Queue<SubscriptionCompensationJobData>("subscription-compensation", {
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
  });
