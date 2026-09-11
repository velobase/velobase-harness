import { z } from "zod";
import {
  adminProcedure,
  protectedProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  subscriptions,
  subscriptionOperation,
} from "@/modules/subscriptions/server/service";
import { appEvents } from "@/server/events/bus";
import {
  CreateSubscriptionParamsSchema,
  CreateSubscriptionCycleParamsSchema,
  GetSubscriptionStatusParamsSchema,
} from "../schemas";
import { getSubscriptionStatus } from "../services/get-subscription-status";
import { earlyConvertTrial } from "../services/early-convert-trial";

export const membershipRouter = createTRPCRouter({
  // Enrollment and paid-period records are not customer-controlled entitlement grants.
  createSubscription: adminProcedure
    .input(CreateSubscriptionParamsSchema)
    .mutation(({ input }) =>
      subscriptionOperation(() => subscriptions.create(input)),
    ),
  createSubscriptionCycle: adminProcedure
    .input(CreateSubscriptionCycleParamsSchema)
    .mutation(({ input }) =>
      subscriptionOperation(() => subscriptions.createCycle(input)),
    ),
  getSubscriptionStatus: protectedProcedure
    .input(GetSubscriptionStatusParamsSchema.optional())
    .query(({ ctx }) => getSubscriptionStatus({ userId: ctx.session.user.id })),
  listSubscriptions: protectedProcedure
    .input(z.object({ cursor: z.string().min(1).max(256).optional() }))
    .query(({ ctx, input }) =>
      subscriptionOperation(() =>
        subscriptions.list(ctx.session.user.id, input),
      ),
    ),
  getSubscription: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(256) }))
    .query(({ ctx, input }) =>
      subscriptionOperation(() =>
        subscriptions.get(ctx.session.user.id, input.id),
      ),
    ),
  cancelSubscription: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      const sub = await subscriptionOperation(() =>
        subscriptions.cancel(ctx.session.user.id, input.id, {
          atPeriodEnd: true,
        }),
      );
      await appEvents.emit("subscription:canceled", {
        subscriptionId: sub.id,
        userId: sub.userId,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      });
      return sub;
    }),
  earlyConvertTrial: protectedProcedure.mutation(({ ctx }) =>
    subscriptionOperation(() =>
      earlyConvertTrial({ userId: ctx.session.user.id }),
    ),
  ),
});
