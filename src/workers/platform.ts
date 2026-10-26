import type { WorkerContribution } from "./types";
import { billingSettlementQueue } from "./queues/billing-settlement.queue";
import {
  processBillingSettlement,
  billingSettlementScheduler,
} from "./processors/billing-settlement";
import { agentExecutionQueue } from "./queues/agent-execution.queue";
import {
  processAgentExecution,
  agentRecoveryScheduler,
} from "./processors/agent-execution";
import { staleJobCleanupQueue } from "./queues/stale-job-cleanup.queue";
import { subscriptionMonthlyCreditsQueue } from "./queues/subscription-monthly-credits.queue";
import {
  processStaleJobCleanup,
  staleJobCleanupScheduler,
} from "./processors/stale-job-cleanup";
import {
  processSubscriptionMonthlyCreditsJob,
  subscriptionMonthlyCreditsScheduler,
} from "./processors/subscription-monthly-credits";

export function getPlatformWorkerContributions(): WorkerContribution[] {
  return [
    {
      id: "platform.billing-settlement",
      queue: billingSettlementQueue,
      processor: processBillingSettlement,
      options: { concurrency: 1, lockDuration: 60_000 },
      scheduler: billingSettlementScheduler,
    },
    {
      id: "platform.agent-execution",
      queue: agentExecutionQueue,
      processor: processAgentExecution,
      options: { concurrency: 4, lockDuration: 60_000 },
      scheduler: agentRecoveryScheduler,
    },
    {
      id: "platform.subscription-monthly-credits",
      queue: subscriptionMonthlyCreditsQueue,
      processor: processSubscriptionMonthlyCreditsJob,
      options: {
        concurrency: 1,
        lockDuration: 300000,
      },
      scheduler: subscriptionMonthlyCreditsScheduler,
    },
    {
      id: "platform.stale-job-cleanup",
      queue: staleJobCleanupQueue,
      processor: processStaleJobCleanup,
      options: {
        concurrency: 1,
        lockDuration: 300000,
      },
      scheduler: staleJobCleanupScheduler,
    },
  ];
}
