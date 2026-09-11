import { z } from "zod";
import {
  sceneInput,
  templateInput,
  scheduleInput,
  pageInput,
} from "@velobase/outreach";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { outreach, outreachOperation } from "./service";
export const outreachRouter = createTRPCRouter({
  scenes: adminProcedure
    .input(pageInput)
    .query(({ input }) => outreach.listScenes(input)),
  templates: adminProcedure
    .input(pageInput.extend({ sceneKey: z.string().min(1) }))
    .query(({ input }) => outreach.listTemplates(input.sceneKey, input)),
  schedules: adminProcedure
    .input(pageInput)
    .query(({ input }) => outreach.listSchedules(input)),
  saveScene: adminProcedure
    .input(sceneInput)
    .mutation(({ input }) =>
      outreachOperation(() => outreach.saveScene(input)),
    ),
  saveTemplate: adminProcedure
    .input(templateInput)
    .mutation(({ input }) =>
      outreachOperation(() => outreach.saveTemplate(input)),
    ),
  schedule: adminProcedure
    .input(scheduleInput)
    .mutation(({ input }) => outreachOperation(() => outreach.schedule(input))),
  cancel: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => outreachOperation(() => outreach.cancel(input))),
  processDue: adminProcedure.mutation(() =>
    outreachOperation(() => outreach.processDue()),
  ),
  recipients: adminProcedure
    .input(pageInput.extend({ search: z.string().max(200).default("") }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.user.findMany({
        where: {
          isBlocked: false,
          emailBounced: false,
          emailComplained: false,
          notificationPreferences: {
            none: { type: "MARKETING_PROMO", emailEnabled: false },
          },
          email: { not: null, contains: input.search, mode: "insensitive" },
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: input.limit + 1,
        select: { id: true, email: true, name: true },
      });
      const items = rows.slice(0, input.limit);
      return {
        items,
        nextCursor: rows.length > input.limit ? items.at(-1)?.id : undefined,
      };
    }),
});
