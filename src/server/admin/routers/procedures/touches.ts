import { outreach, outreachOperation } from "@/modules/outreach/server/service";
import { z } from "zod";
import { adminProcedure } from "@/server/api/trpc";
import type { Prisma, TouchScheduleStatus, TouchChannel } from "@prisma/client";

// ============================================================================
// Touch Scenes
// ============================================================================

export const listTouchScenes = adminProcedure
  .input(
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      channel: z.enum(["all", "EMAIL", "SMS", "PUSH"]).default("all"),
      isActive: z.enum(["all", "true", "false"]).default("all"),
    }),
  )
  .query(async ({ ctx, input }) => {
    const { page, pageSize, search, channel, isActive } = input;

    const where: Prisma.TouchSceneWhereInput = {};

    if (search) {
      where.OR = [
        { key: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (channel !== "all") {
      where.channel = channel as TouchChannel;
    }

    if (isActive !== "all") {
      where.isActive = isActive === "true";
    }

    const total = await ctx.db.touchScene.count({ where });

    const items = await ctx.db.touchScene.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        templates: {
          select: {
            id: true,
            locale: true,
            version: true,
            isDefault: true,
            isActive: true,
          },
          orderBy: [{ isDefault: "desc" }, { locale: "asc" }],
        },
        _count: {
          select: { schedules: true },
        },
      },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const getTouchScene = adminProcedure
  .input(z.object({ key: z.string() }))
  .query(async ({ ctx, input }) => {
    const scene = await ctx.db.touchScene.findUnique({
      where: { key: input.key },
      include: {
        templates: {
          orderBy: [
            { isDefault: "desc" },
            { locale: "asc" },
            { version: "asc" },
          ],
        },
        _count: {
          select: { schedules: true },
        },
      },
    });

    if (!scene) {
      throw new Error("Scene not found");
    }

    return scene;
  });

export const createTouchScene = adminProcedure
  .input(
    z.object({
      key: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9_]+$/),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      channel: z.enum(["EMAIL", "SMS", "PUSH"]),
      triggerType: z.enum(["SCHEDULED", "EVENT", "MANUAL"]),
      isActive: z.boolean().default(true),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const scene = await ctx.db.touchScene.create({
      data: input,
    });
    return scene;
  });

export const updateTouchScene = adminProcedure
  .input(
    z.object({
      key: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      channel: z.enum(["EMAIL", "SMS", "PUSH"]).optional(),
      triggerType: z.enum(["SCHEDULED", "EVENT", "MANUAL"]).optional(),
      isActive: z.boolean().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { key, ...data } = input;
    const scene = await ctx.db.touchScene.update({
      where: { key },
      data,
    });
    return scene;
  });

// ============================================================================
// Touch Templates
// ============================================================================

export const getTouchTemplate = adminProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const template = await ctx.db.touchTemplate.findUnique({
      where: { id: input.id },
      include: { scene: true },
    });

    if (!template) {
      throw new Error("Template not found");
    }

    return template;
  });

export const createTouchTemplate = adminProcedure
  .input(
    z.object({
      sceneKey: z.string(),
      locale: z.string().default("en"),
      version: z.string().default("default"),
      isDefault: z.boolean().default(false),
      isActive: z.boolean().default(true),
      subject: z.string().optional(),
      bodyText: z.string().optional(),
      bodyHtml: z.string().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const template = await ctx.db.touchTemplate.create({
      data: input,
    });
    return template;
  });

export const updateTouchTemplate = adminProcedure
  .input(
    z.object({
      id: z.string(),
      locale: z.string().optional(),
      version: z.string().optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      subject: z.string().optional(),
      bodyText: z.string().optional(),
      bodyHtml: z.string().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const template = await ctx.db.touchTemplate.update({
      where: { id },
      data,
    });
    return template;
  });

export const deleteTouchTemplate = adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.touchTemplate.delete({
      where: { id: input.id },
    });
    return { success: true };
  });

// ============================================================================
// Touch Schedules
// ============================================================================

export const listTouchSchedules = adminProcedure
  .input(
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      status: z
        .enum([
          "all",
          "PENDING",
          "PROCESSING",
          "SENT",
          "CANCELLED",
          "SUPERSEDED",
          "FAILED",
          "UNKNOWN",
        ])
        .default("all"),
      sceneKey: z.string().optional(), // 按场景筛选
      channel: z.enum(["all", "EMAIL", "SMS", "PUSH"]).default("all"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const {
      page,
      pageSize,
      search,
      status,
      sceneKey,
      channel,
      dateFrom,
      dateTo,
    } = input;

    const where: Prisma.TouchScheduleWhereInput = {};

    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { userId: { contains: search, mode: "insensitive" } },
        { referenceId: { contains: search, mode: "insensitive" } },
        { dedupeKey: { contains: search, mode: "insensitive" } },
        { referenceType: { contains: search, mode: "insensitive" } },
        { sceneKey: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status !== "all") {
      where.status = status as TouchScheduleStatus;
    }

    if (sceneKey) {
      where.sceneKey = sceneKey;
    }

    if (channel !== "all") {
      where.channel = channel as TouchChannel;
    }

    if (dateFrom || dateTo) {
      where.scheduledAt = {};
      if (dateFrom) where.scheduledAt.gte = new Date(dateFrom);
      if (dateTo) where.scheduledAt.lte = new Date(dateTo);
    }

    const total = await ctx.db.touchSchedule.count({ where });

    const items = await ctx.db.touchSchedule.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { scheduledAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        records: {
          select: {
            id: true,
            status: true,
            occurredAt: true,
          },
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
      },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const getTouchScheduleDetails = adminProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const schedule = await ctx.db.touchSchedule.findUnique({
      where: { id: input.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        records: {
          orderBy: { occurredAt: "desc" },
          take: 50,
        },
      },
    });

    if (!schedule) {
      throw new Error("Schedule not found");
    }

    return schedule;
  });

export const cancelTouchSchedule = adminProcedure
  .input(z.object({ id: z.string(), reason: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    const schedule = await ctx.db.touchSchedule.findUnique({
      where: { id: input.id },
    });

    if (!schedule) {
      throw new Error("Schedule not found");
    }

    if (schedule.referenceType === "OUTREACH") {
      await outreachOperation(() => outreach.cancel({ id: schedule.id }));
      return { success: true };
    }

    if (schedule.status !== "PENDING" && schedule.status !== "PROCESSING") {
      throw new Error(`Cannot cancel schedule with status: ${schedule.status}`);
    }

    await ctx.db.touchSchedule.update({
      where: { id: input.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        lastError: input.reason ?? "Admin cancelled",
        lockedAt: null,
        lockId: null,
      },
    });

    return { success: true };
  });
