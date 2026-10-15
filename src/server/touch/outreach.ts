import {
  createOutreach,
  OutreachError,
  snapshotSchema,
  type OutreachRepository,
  type Schedule,
  type Scene,
  type Template,
  type Page,
} from "@velobase/outreach";
import { TRPCError } from "@trpc/server";
import type {
  Prisma,
  TouchScene,
  TouchTemplate,
  TouchSchedule,
} from "@prisma/client";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";
import { sendEmail } from "@/server/email";
const scene = (row: TouchScene): Scene => ({
  key: row.key,
  name: row.name,
  description: row.description ?? "",
  isActive: row.isActive,
});
const template = (row: TouchTemplate): Template => ({
  id: row.id,
  sceneKey: row.sceneKey,
  name: row.version,
  subject: row.subject ?? "",
  text: row.bodyText ?? "",
  ...(row.bodyHtml ? { html: row.bodyHtml } : {}),
});
function schedule(row: TouchSchedule): Schedule {
  if (
    !["PENDING", "PROCESSING", "SENT", "CANCELLED", "UNKNOWN"].includes(
      row.status,
    )
  )
    throw new Error("Unsupported outreach delivery status");
  return {
    id: row.id,
    sceneKey: row.sceneKey!,
    requestId: row.referenceId,
    scheduledAt: row.scheduledAt,
    snapshot: snapshotSchema.parse(row.payload),
    status: row.status as Schedule["status"],
    updatedAt: row.updatedAt,
  };
}
function page<T>(rows: T[], limit: number, key: (value: T) => string): Page<T> {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor:
      rows.length > limit && items.length
        ? key(items[items.length - 1]!)
        : undefined,
  };
}
const repository: OutreachRepository = {
  async saveScene(data) {
    const row = await db.touchScene.upsert({
      where: { key: data.key, channel: "EMAIL" },
      create: { ...data, channel: "EMAIL", triggerType: "MANUAL" },
      update: data,
    });
    return scene(row);
  },
  async getScene(key) {
    const row = await db.touchScene.findFirst({
      where: { key, channel: "EMAIL" },
    });
    return row ? scene(row) : null;
  },
  async listScenes({ cursor, limit }) {
    const rows = await db.touchScene.findMany({
      where: { channel: "EMAIL", ...(cursor ? { key: { gt: cursor } } : {}) },
      orderBy: { key: "asc" },
      take: limit + 1,
    });
    return page(rows.map(scene), limit, (row) => row.key);
  },
  async saveTemplate(data) {
    const fields = {
      sceneKey: data.sceneKey,
      version: data.name,
      subject: data.subject,
      bodyText: data.text,
      bodyHtml: data.html ?? null,
    };
    const row = await db.touchTemplate.upsert({
      where: { id: data.id },
      create: { id: data.id, ...fields, locale: "en", isActive: true },
      update: fields,
    });
    return template(row);
  },
  async getTemplate(id) {
    const row = await db.touchTemplate.findFirst({
      where: { id, isActive: true, scene: { channel: "EMAIL" } },
    });
    return row ? template(row) : null;
  },
  async listTemplates(sceneKey, { cursor, limit }) {
    const rows = await db.touchTemplate.findMany({
      where: {
        sceneKey,
        isActive: true,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    return page(rows.map(template), limit, (row) => row.id);
  },
  async createSchedule(data) {
    const row = await db.touchSchedule.upsert({
      where: { dedupeKey: `outreach:${data.requestId}` },
      update: {},
      create: {
        id: data.id,
        userId: data.snapshot.recipientId,
        channel: "EMAIL",
        sceneKey: data.sceneKey,
        referenceType: "OUTREACH",
        referenceId: data.requestId,
        dedupeKey: `outreach:${data.requestId}`,
        scheduledAt: data.scheduledAt,
        nextAttemptAt: data.scheduledAt,
        payload: data.snapshot as Prisma.InputJsonValue,
        maxAttempts: 1,
      },
    });
    return schedule(row);
  },
  async listSchedules({ cursor, limit }) {
    const rows = await db.touchSchedule.findMany({
      where: {
        referenceType: "OUTREACH",
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    return page(rows.map(schedule), limit, (row) => row.id);
  },
  async due(limit) {
    return (
      await db.touchSchedule.findMany({
        where: {
          referenceType: "OUTREACH",
          status: "PENDING",
          scheduledAt: { lte: new Date() },
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: limit,
      })
    ).map(schedule);
  },
  async claim(id, token) {
    const result = await db.touchSchedule.updateMany({
      where: { id, referenceType: "OUTREACH", status: "PENDING" },
      data: { status: "PROCESSING", lockId: token, lockedAt: new Date() },
    });
    return result.count > 0;
  },
  async release(id, token) {
    await db.touchSchedule.updateMany({
      where: { id, status: "PROCESSING", lockId: token },
      data: { status: "PENDING", lockId: null, lockedAt: null },
    });
  },
  async cancel(id) {
    const result = await db.touchSchedule.updateMany({
      where: { id, referenceType: "OUTREACH", status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return result.count > 0;
  },
  async recoverInterrupted(before) {
    await db.touchSchedule.updateMany({
      where: {
        referenceType: "OUTREACH",
        status: "PROCESSING",
        lockedAt: { lt: before },
      },
      data: {
        status: "UNKNOWN",
        lockId: null,
        lockedAt: null,
        lastError: "Delivery outcome unknown after interruption",
      },
    });
  },
  async finish(id, token, result) {
    await db.$transaction(async (tx) => {
      const row = await tx.touchSchedule.findFirst({
        where: { id, status: "PROCESSING", lockId: token },
      });
      if (!row) throw new Error("Delivery claim is no longer owned");
      const payload = snapshotSchema.parse(row.payload);
      const template = await tx.touchTemplate.findUnique({
        where: { id: payload.templateId },
        select: { id: true },
      });
      const changed = await tx.touchSchedule.updateMany({
        where: { id, status: "PROCESSING", lockId: token },
        data: {
          status: result.status,
          lockId: null,
          lockedAt: null,
          attemptCount: { increment: 1 },
          sentAt: result.status === "SENT" ? new Date() : null,
        },
      });
      if (!changed.count) throw new Error("Delivery claim changed");
      await tx.touchRecord.create({
        data: {
          scheduleId: id,
          attemptNumber: row.attemptCount + 1,
          templateId: template?.id ?? null,
          provider: result.provider ?? "unknown",
          providerMessageId:
            result.messageId && result.messageId !== "unknown"
              ? result.messageId
              : null,
          toEmail: payload.to,
          subject: payload.subject,
          status: result.status,
          meta: payload as Prisma.InputJsonValue,
        },
      });
    });
  },
};
export const outreach = createOutreach({
  repository,
  isEnabled: () => isFeatureEnabled("touch"),
  async recipient(id) {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isBlocked: true,
        emailBounced: true,
        emailComplained: true,
        notificationPreferences: {
          where: { type: "MARKETING_PROMO" },
          select: { emailEnabled: true },
        },
      },
    });
    return user?.email
      ? {
          id: user.id,
          email: user.email,
          allowed:
            !user.isBlocked &&
            !user.emailBounced &&
            !user.emailComplained &&
            user.notificationPreferences[0]?.emailEnabled !== false,
        }
      : null;
  },
  async deliver(snapshot) {
    const result = await sendEmail({
      to: snapshot.to,
      subject: snapshot.subject,
      text: snapshot.text,
      html: snapshot.html,
      deliveryPolicy: "single-provider",
    });
    return { provider: result.provider, messageId: result.messageId };
  },
});
export async function outreachOperation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OutreachError)
      throw new TRPCError({ code: error.code, message: error.message });
    throw error;
  }
}
