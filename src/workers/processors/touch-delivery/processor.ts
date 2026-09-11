import { outreach } from "@/modules/outreach/server/service";
import type { Job } from "bullmq";
import { createLogger } from "@/lib/logger";
import type { TouchDeliveryJobData } from "../../queues/touch-delivery.queue";
import { processDueTouchSchedules } from "@/server/touch/services/process-due-schedules";

const logger = createLogger("touch-delivery");

export async function processTouchDeliveryJob(
  job: Job<TouchDeliveryJobData>,
): Promise<void> {
  if (job.data.type !== "scheduled-scan") return;
  await outreach.processDue(50);
  const res = await processDueTouchSchedules({ batchSize: 50 });
  logger.info({ processed: res.processed }, "Touch delivery scan done");
}
