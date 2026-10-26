import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import { queueTelemetry } from "@/server/telemetry/queue";
import { createLogger } from "@/lib/logger";

export const billingSettlementQueue = new Queue("billing-settlement", {
  connection: redis,
  telemetry: queueTelemetry(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
const logger = createLogger("billing-settlement-queue");
billingSettlementQueue.on("error", (err) => {
  logger.error({ err }, "Billing settlement queue error");
});
