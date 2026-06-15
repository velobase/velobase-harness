import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const IMAGE_GENERATION_QUEUE_NAME = "image-generation";

export interface ImageGenerationJobData {
  type: "run-task";
  taskId: string;
}

export const imageGenerationQueue = new Queue<ImageGenerationJobData>(
  IMAGE_GENERATION_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  },
);

export async function enqueueImageGenerationTask(
  taskId: string,
): Promise<void> {
  await imageGenerationQueue.add(
    `image-generation-${taskId}`,
    {
      type: "run-task",
      taskId,
    },
    {
      jobId: taskId,
    },
  );
}
