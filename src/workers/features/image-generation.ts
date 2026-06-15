import type { WorkerContribution } from "../types";
import { imageGenerationQueue } from "../queues/image-generation.queue";
import { processImageGenerationJob } from "../processors/image-generation";

export function getImageGenerationWorkerContributions(): WorkerContribution[] {
  return [
    {
      id: "image-generation.process",
      queue: imageGenerationQueue,
      processor: processImageGenerationJob,
      options: {
        concurrency: 2,
        lockDuration: 10 * 60 * 1000,
      },
    },
  ];
}
