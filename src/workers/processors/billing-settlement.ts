import { getCreditLedger } from "@/server/billing/ledger";
import { createLogger } from "@/lib/logger";
import { defineRepeatableScheduler } from "@/workers/scheduler";
import { billingSettlementQueue } from "@/workers/queues/billing-settlement.queue";

const logger = createLogger("billing-settlement");

export async function processBillingSettlement(): Promise<void> {
  // Existing obligations must settle even when new credit operations are disabled.
  try {
    await getCreditLedger().settleDue();
  } catch (err) {
    logger.error({ err }, "Billing settlement scan failed");
    throw err;
  }
}

export const billingSettlementScheduler = defineRepeatableScheduler({
  id: "platform.billing-settlement",
  queue: billingSettlementQueue,
  jobName: "settle-due",
  data: {},
  options: { repeat: { every: 60_000 }, jobId: "billing-settle-due" },
  logger,
  readyMessage: "Billing settlement scheduler registered: every minute",
});
