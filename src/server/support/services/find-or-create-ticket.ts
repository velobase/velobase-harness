import { db } from "@/server/db";
import type { Prisma, SupportActorType } from "@prisma/client";
import type { ParsedEmail } from "../types";

/** Persist receipt and ticket update atomically. A sender cannot attach mail to someone else's thread. */
export async function findOrCreateTicket(
  email: ParsedEmail,
  assignedTo: SupportActorType = "AGENT",
) {
  const contact = email.from.address.toLowerCase();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email.messageId}))`;
    const existing = await tx.supportTimeline.findFirst({
      where: { metadata: { path: ["messageId"], equals: email.messageId } },
      include: { ticket: true },
    });
    if (existing) return existing.ticket;
    const references = [
      email.inReplyTo,
      ...(email.references?.split(/\s+/) ?? []),
    ].filter((value): value is string => Boolean(value));
    const parent = references.length
      ? await tx.supportTimeline.findFirst({
          where: {
            ticket: { contact, channel: "email" },
            OR: references.map((id) => ({
              metadata: { path: ["messageId"], equals: id },
            })),
          },
          include: { ticket: true },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const user = parent
      ? null
      : await tx.user.findFirst({
          where: { OR: [{ email: contact }, { canonicalEmail: contact }] },
          select: { id: true },
        });
    const ticket = parent
      ? await tx.supportTicket.update({
          where: { id: parent.ticketId },
          data: {
            status: "OPEN",
            resolvedAt: null,
            assignedTo:
              parent.ticket.assignedTo === "AGENT" ? "AGENT" : assignedTo,
          },
        })
      : await tx.supportTicket.create({
          data: {
            userId: user?.id,
            contact,
            channel: "email",
            subject: email.subject,
            status: "OPEN",
            assignedTo,
          },
        });
    await tx.supportTimeline.create({
      data: {
        ticketId: ticket.id,
        actor: "USER",
        type: "MESSAGE",
        content: email.text ?? "",
        metadata: {
          messageId: email.messageId,
          inReplyTo: email.inReplyTo,
          references: email.references,
          cc: email.cc,
        } as Prisma.InputJsonValue,
      },
    });
    return ticket;
  });
}
export async function isEmailProcessed(messageId: string): Promise<boolean> {
  return Boolean(
    await db.supportTimeline.findFirst({
      where: { metadata: { path: ["messageId"], equals: messageId } },
      select: { id: true },
    }),
  );
}
