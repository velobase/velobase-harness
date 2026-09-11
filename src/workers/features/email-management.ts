import type { WorkerContribution } from "../types";
import { supportSyncQueue } from "../queues/support-sync.queue";
import { supportSendQueue } from "../queues/support-send.queue";
import {
  processSupportSyncJob,
  supportSyncScheduler,
} from "../processors/support-sync";
import {
  processSupportSendJob,
  supportSendScheduler,
} from "../processors/support-send";

export function getEmailManagementWorkerContributions(): WorkerContribution[] {
  return [
    {
      id: "email-management.sync",
      queue: supportSyncQueue,
      processor: processSupportSyncJob,
      options: { concurrency: 1, lockDuration: 120000 },
      scheduler: supportSyncScheduler,
    },
    {
      id: "email-management.send",
      queue: supportSendQueue,
      processor: processSupportSendJob,
      options: { concurrency: 3, lockDuration: 60000 },
      scheduler: supportSendScheduler,
    },
  ];
}
