import { queueTelemetry } from "@/server/telemetry/queue";
/**
 * Payment Reconciliation Queue
 *
 * Stripe + NowPayments reconciliation (hourly + daily at LA 00:00 via hourly trigger).
 */
import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import { createLogger } from "@/lib/logger";

export const PAYMENT_RECONCILIATION_QUEUE_NAME = "payment-reconciliation";

export interface PaymentReconciliationJobData {
  type: "hourly-reconcile";
}

export const paymentReconciliationQueue =
  new Queue<PaymentReconciliationJobData>(PAYMENT_RECONCILIATION_QUEUE_NAME, {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 7 * 24 * 3600, count: 200 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });

const logger = createLogger("queue:payment-reconciliation");
paymentReconciliationQueue.on("error", (err) => {
  logger.error({ err }, "Payment reconciliation queue error");
});
