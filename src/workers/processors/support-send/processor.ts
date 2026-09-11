import type { Job } from "bullmq";
import { db } from "@/server/db";
import type { SupportSendJobData } from "../../queues/support-send.queue";
import { sendQueuedReply } from "@/modules/email-management/server/service";

export async function processSupportSendJob(
  job: Job<SupportSendJobData>,
): Promise<void> {
  if (job.data.type !== "send-reply") return;
  if ("replyId" in job.data) {
    await sendQueuedReply(job.data.replyId);
    return;
  }
  // Legacy AI jobs remain readable after deploy. Stable delivery identity prevents replay sends.
  const id = `ai-${job.id ?? `${job.data.ticketId}-${job.timestamp}`}`;
  await db.supportReply.upsert({
    where: { id },
    update: {},
    create: {
      id,
      ticketId: job.data.ticketId,
      actor: "AI",
      body: job.data.body,
    },
  });
  await sendQueuedReply(id);
}
