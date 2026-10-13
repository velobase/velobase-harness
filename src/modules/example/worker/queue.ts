import { queueTelemetry } from "@/server/telemetry/queue";
import { Queue } from "bullmq";
import { redis } from "@/server/redis";

export const EXAMPLE_QUEUE_NAME = "example-processing";

export interface ExampleJobData {
  itemId: string;
  userId: string;
  action: "process" | "cleanup";
}

export const exampleQueue = new Queue<ExampleJobData>(EXAMPLE_QUEUE_NAME, {
  connection: redis,
  telemetry: queueTelemetry(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
