import { queueTelemetry } from "@/server/telemetry/queue";
import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import { createLogger } from "@/lib/logger";

export const CONVERSION_ALERT_QUEUE_NAME = "conversion-alert";

export interface ConversionAlertJobData {
  type: "hourly-check";
}

export const conversionAlertQueue = new Queue<ConversionAlertJobData>(
  CONVERSION_ALERT_QUEUE_NAME,
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: {
        age: 24 * 3600,
        count: 100,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  },
);

const logger = createLogger("queue:conversion-alert");

conversionAlertQueue.on("error", (err) => {
  logger.error({ err }, "Conversion alert queue error");
});
