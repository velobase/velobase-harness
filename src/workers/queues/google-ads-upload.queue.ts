import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Google Ads Upload Queue
 *
 * 批量上传架构：
 * - 业务侧：直接 ZADD 写入 Redis ZSET（去重）
 * - Worker 侧：定时 flush 任务，从 Redis 批量取 + 批量上传
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const GOOGLE_ADS_UPLOAD_QUEUE_NAME = "google-ads-upload";

export type GoogleAdsUploadJobData = { type: "flush" };

export const googleAdsUploadQueue = new Queue<GoogleAdsUploadJobData>(
  GOOGLE_ADS_UPLOAD_QUEUE_NAME,
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      // flush 任务固定周期触发；失败时交给下一轮触发或少量重试即可
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
      removeOnFail: { count: 5000, age: 14 * 24 * 3600 },
    },
  },
);
