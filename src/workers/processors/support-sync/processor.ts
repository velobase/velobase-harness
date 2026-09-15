import type { Job } from "bullmq";
import type { SupportSyncJobData } from "../../queues/support-sync.queue";
import { isFeatureEnabled } from "@/server/features/state";
import {
  dispatchPendingReplies,
  synchronizeMailbox,
} from "@/modules/email-management/server/service";
export async function processSupportSyncJob(job: Job<SupportSyncJobData>) {
  if (
    job.data.type !== "scheduled-scan" ||
    !(await isFeatureEnabled("email-management"))
  )
    return;
  await dispatchPendingReplies();
  await synchronizeMailbox();
}
