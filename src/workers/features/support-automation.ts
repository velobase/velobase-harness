import type { WorkerContribution } from "../types";
import { supportProcessQueue } from "../queues/support-process.queue";
import {
  processSupportProcessJob,
  supportProcessScheduler,
} from "../processors/support-process";

/** AI is an extension of mailbox processing, never an owner of receiving or sending. */
export function getSupportAutomationWorkerContributions(): WorkerContribution[] {
  return [
    {
      id: "support-automation.process",
      queue: supportProcessQueue,
      processor: processSupportProcessJob,
      options: { concurrency: 5, lockDuration: 300000 },
      scheduler: supportProcessScheduler,
    },
  ];
}
