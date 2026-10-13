import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { inspectMailbox, readMailbox } from "@velobase/mailbox";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { getMailboxConfig } from "@/server/features/connections";
import { isFeatureEnabled, requireFeature } from "@/server/features/state";
import { findOrCreateTicket } from "@/server/support/services/find-or-create-ticket";
import { sendEmail } from "@/server/email/mailbox";

const log = createLogger("email-management");
const cursorId = "email_inbox";

export async function synchronizeMailbox() {
  await requireFeature("email-management");
  const config = await getMailboxConfig();
  if (!config)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure the mailbox first",
    });
  let cursor = await db.supportSyncCursor.findUnique({
    where: { id: cursorId },
  });
  if (!cursor) {
    const initial = await inspectMailbox(config);
    cursor = await db.supportSyncCursor.upsert({
      where: { id: cursorId },
      create: { id: cursorId, ...initial },
      update: {},
    });
  }
  const leaseToken = randomUUID();
  const lease = await db.supportSyncCursor.updateMany({
    where: {
      id: cursorId,
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
    },
    data: { leaseToken, leaseExpiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  if (!lease.count) return { imported: 0 };
  try {
    cursor = await db.supportSyncCursor.findUniqueOrThrow({
      where: { id: cursorId },
    });
    const batch = await readMailbox(config, cursor);
    const aiEnabled = await isFeatureEnabled("ai-support");
    let imported = 0;
    for (const email of batch.messages) {
      if (!(await isFeatureEnabled("email-management"))) break;
      // Stop at the first persistence failure. Never advance over a failed message.
      const ticket = await findOrCreateTicket(
        email,
        aiEnabled ? "AI" : "AGENT",
      );
      if (aiEnabled && ticket.assignedTo === "AI") {
        const { supportProcessQueue } =
          await import("@/workers/queues/support-process.queue");
        await supportProcessQueue.add(
          `process-${ticket.id}`,
          { type: "process-ticket", ticketId: ticket.id },
          { jobId: `mail-${email.uid}-${batch.uidValidity}` },
        );
      }
      await db.supportSyncCursor.update({
        where: { id: cursorId, leaseToken, leaseExpiresAt: { gt: new Date() } },
        data: { lastUid: email.uid, uidValidity: batch.uidValidity },
      });
      imported++;
    }
    if (!batch.messages.length && batch.uidValidity !== cursor.uidValidity) {
      await db.supportSyncCursor.update({
        where: { id: cursorId, leaseToken, leaseExpiresAt: { gt: new Date() } },
        data: { uidValidity: batch.uidValidity, lastUid: batch.lastUid },
      });
    }
    return { imported };
  } finally {
    await db.supportSyncCursor.updateMany({
      where: { id: cursorId, leaseToken },
      data: { leaseToken: null, leaseExpiresAt: null },
    });
  }
}

export async function queueManualReply(
  input: { ticketId: string; requestId: string; body: string },
  userId: string,
) {
  await requireFeature("email-management");
  const ticket = await db.supportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (
    ticket?.channel !== "email" ||
    !z.string().email().safeParse(ticket.contact).success
  )
    throw new TRPCError({ code: "NOT_FOUND" });
  const reply = await db.$transaction(async (tx) => {
    const existing = await tx.supportReply.findUnique({
      where: { id: input.requestId },
    });
    if (existing) {
      if (
        existing.ticketId !== input.ticketId ||
        existing.actorId !== userId ||
        existing.body !== input.body
      )
        throw new TRPCError({ code: "CONFLICT" });
      return existing;
    }
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedTo: "AGENT" },
    });
    return tx.supportReply.create({
      data: {
        id: input.requestId,
        ticketId: ticket.id,
        actor: "AGENT",
        actorId: userId,
        body: input.body,
      },
    });
  });
  if (env.REDIS_URL || env.REDIS_HOST) await dispatchPendingReplies();
  else await sendQueuedReply(reply.id);
  return db.supportReply.findUniqueOrThrow({
    where: { id: reply.id },
    select: { id: true, status: true },
  });
}

export async function dispatchPendingReplies() {
  if (!(await isFeatureEnabled("email-management"))) return;
  await db.supportReply.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
    data: { status: "UNKNOWN" },
  });
  const pending = await db.supportReply.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (!pending.length) return;
  const { supportSendQueue } =
    await import("@/workers/queues/support-send.queue");
  for (const reply of pending) {
    await supportSendQueue.add(
      "send-reply",
      { type: "send-reply", replyId: reply.id },
      { jobId: `reply-${reply.id}`, attempts: 1, removeOnComplete: true },
    );
  }
}

export async function sendQueuedReply(id: string) {
  if (!(await isFeatureEnabled("email-management"))) return;
  const reply = await db.supportReply.findUnique({
    where: { id },
    include: {
      ticket: {
        include: {
          timeline: {
            where: { actor: "USER", type: "MESSAGE" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!reply || reply.status !== "PENDING") return;
  if (
    reply.actor === "AI" &&
    (!(await isFeatureEnabled("ai-support")) ||
      reply.ticket.assignedTo === "AGENT")
  ) {
    await db.supportReply.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    return;
  }
  const claim = await db.supportReply.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  if (!claim.count) return;
  const metadata = z
    .object({
      messageId: z.string().optional(),
      references: z.string().optional(),
    })
    .passthrough()
    .safeParse(reply.ticket.timeline[0]?.metadata);
  const inReplyTo = metadata.success ? metadata.data.messageId : undefined;
  const references = [
    metadata.success ? metadata.data.references : undefined,
    inReplyTo,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const messageId = await sendEmail({
      to: reply.ticket.contact,
      subject: `Re: ${(reply.ticket.subject ?? "").replace(/[\r\n]/g, " ")}`,
      text: reply.body,
      inReplyTo,
      references,
      messageId: `<harness-${id}@reply.local>`,
    });
    await db.$transaction(async (tx) => {
      await tx.supportReply.update({
        where: { id },
        data: { status: "SENT", messageId },
      });
      await tx.supportTimeline.create({
        data: {
          id,
          ticketId: reply.ticketId,
          actor: reply.actor,
          actorId: reply.actorId,
          type: "MESSAGE",
          content: reply.body,
          metadata: { messageId, inReplyTo, references },
        },
      });
      await tx.supportTicket.update({
        where: { id: reply.ticketId },
        data: { status: "WAITING" },
      });
    });
  } catch (error) {
    // SMTP may have accepted a message even when the response/DB write failed. No blind retry.
    await db.supportReply.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "UNKNOWN" },
    });
    log.error(
      { replyId: id, error: error instanceof Error ? error.name : "Unknown" },
      "Delivery outcome needs operator review",
    );
  }
}

export async function setTicketStatus(
  id: string,
  status: "OPEN" | "SOLVED",
  userId: string,
) {
  await requireFeature("email-management");
  return db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.update({
      where: { id },
      data: {
        status,
        assignedTo: "AGENT",
        resolvedAt: status === "SOLVED" ? new Date() : null,
      },
    });
    await tx.supportTimeline.create({
      data: {
        ticketId: id,
        actor: "AGENT",
        actorId: userId,
        type: "SYSTEM",
        content: status,
      },
    });
    return { id: ticket.id, status: ticket.status };
  });
}
