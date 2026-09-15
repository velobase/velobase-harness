/**
 * Worker Factory
 *
 * 封装 BullMQ Worker 创建，统一事件处理
 */
import { Worker } from "bullmq";
import type { Job, WorkerOptions } from "bullmq";
import { redis } from "@/server/redis";
import { createLogger } from "@/lib/logger";
import { asyncSendBackendAlert } from "@/lib/lark";

type ProcessorFunction<T> = (job: Job<T>, token?: string) => Promise<void>;

interface CreateWorkerOptions extends Omit<WorkerOptions, "connection"> {
  concurrency?: number;
  lockDuration?: number;
}

const defaultOptions: CreateWorkerOptions = {
  concurrency: 2,
  lockDuration: 300000, // 5 minutes
};

export function createWorkerInstance<T>(
  queueName: string,
  processor: ProcessorFunction<T>,
  options: CreateWorkerOptions = {},
): Worker<T> {
  const logger = createLogger(`worker:${queueName}`);
  const mergedOptions = { ...defaultOptions, ...options };

  const worker = new Worker<T>(queueName, processor, {
    connection: redis,
    ...mergedOptions,
  });

  // 统一事件处理
  worker.on("active", (job) => {
    logger.info(
      { jobId: job.id, jobName: job.name, data: job.data },
      "🔄 Job started",
    );
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "✅ Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        error: err.message,
        stack: err.stack,
        attempts: job?.attemptsMade,
      },
      "❌ Job failed",
    );

    asyncSendBackendAlert({
      title: `Worker 任务失败 - ${queueName}`,
      severity: "error",
      source: "worker",
      environment: process.env.NODE_ENV,
      service: queueName,
      resourceId: job?.id ? String(job.id) : undefined,
      user:
        ((job?.data as Record<string, unknown>)?.userId as
          | string
          | undefined) ||
        ((job?.data as Record<string, unknown>)?.user_id as
          | string
          | undefined) ||
        ((job?.data as Record<string, unknown>)?.email as string | undefined),
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
      metadata: {
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        data: job?.data,
      },
    });
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message, stack: err.stack }, "Worker error");

    asyncSendBackendAlert({
      title: `Worker 实例错误 - ${queueName}`,
      severity: "critical",
      source: "worker",
      environment: process.env.NODE_ENV,
      service: queueName,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
    });
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "⚠️ Job stalled");

    asyncSendBackendAlert({
      title: `Worker 任务卡住 - ${queueName}`,
      severity: "warning",
      source: "worker",
      environment: process.env.NODE_ENV,
      service: queueName,
      resourceId: jobId ? String(jobId) : undefined,
    });
  });

  logger.info({ concurrency: mergedOptions.concurrency }, "Worker registered");

  return worker;
}
