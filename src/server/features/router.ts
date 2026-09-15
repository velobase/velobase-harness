import { z } from "zod";
import {
  createTRPCRouter,
  adminProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { getFeatureStates, isFeatureId, setFeatureEnabled } from "./state";
import {
  mailboxSchema,
  mailboxSummary,
  saveMailbox,
  verifyMailboxConnection,
} from "./connections";

export const featuresRouter = createTRPCRouter({
  publicState: publicProcedure.query(async () =>
    (await getFeatureStates())
      .filter((feature) => feature.enabled)
      .map((feature) => feature.id),
  ),
  inventory: adminProcedure.query(() => getFeatureStates()),
  setEnabled: adminProcedure
    .input(
      z.object({
        id: z.string().refine((id): boolean => isFeatureId(id)),
        enabled: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setFeatureEnabled(input.id, input.enabled, ctx.session.user.id),
    ),
  verifyMailbox: adminProcedure.mutation(() => verifyMailboxConnection()),
  mailbox: adminProcedure.query(() => mailboxSummary()),
  saveMailbox: adminProcedure
    .input(mailboxSchema.extend({ password: z.string().max(4096).optional() }))
    .mutation(({ ctx, input }) =>
      saveMailbox(
        mailboxSchema.parse(input),
        input.password,
        ctx.session.user.id,
      ),
    ),
});
