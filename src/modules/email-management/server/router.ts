import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import {
  queueManualReply,
  setTicketStatus,
  synchronizeMailbox,
} from "./service";

export const emailManagementRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        status: z
          .enum(["OPEN", "NEEDS_APPROVAL", "WAITING", "SOLVED"])
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.supportTicket.findMany({
        where: { channel: "email", status: input.status },
        select: {
          id: true,
          contact: true,
          subject: true,
          status: true,
          assignedTo: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, input.limit);
      return {
        items,
        nextCursor: rows.length > input.limit ? items.at(-1)?.id : undefined,
      };
    }),
  ticket: adminProcedure
    .input(z.object({ id: z.string(), cursor: z.string().optional() }))
    .query(({ ctx, input }) =>
      ctx.db.supportTicket.findUnique({
        where: { id: input.id },
        include: {
          timeline: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 21,
            ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          },
          replies: {
            where: { status: { not: "SENT" } },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      }),
    ),
  reply: adminProcedure
    .input(
      z.object({
        ticketId: z.string(),
        requestId: z.string().uuid(),
        body: z.string().trim().min(1).max(50000),
      }),
    )
    .mutation(({ ctx, input }) => queueManualReply(input, ctx.session.user.id)),
  setStatus: adminProcedure
    .input(z.object({ id: z.string(), status: z.enum(["OPEN", "SOLVED"]) }))
    .mutation(({ ctx, input }) =>
      setTicketStatus(input.id, input.status, ctx.session.user.id),
    ),
  cancelReply: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.supportReply.updateMany({
        where: { id: input.id, status: "PENDING" },
        data: { status: "CANCELED" },
      });
      return { success: true };
    }),
  sync: adminProcedure.mutation(() => synchronizeMailbox()),
});
