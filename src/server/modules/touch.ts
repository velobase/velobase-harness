import type { FrameworkModule } from "@/server/modules/registry";
import type { AppEventBus } from "@/server/events/bus";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:touch");

export const touchModule: FrameworkModule = {
  name: "touch",
  enabled: true,

  registerEventHandlers(bus: AppEventBus) {
    bus.on("subscription:cycle-created", async ({ cycleId }) => {
      const { upsertSubscriptionRenewalReminderSchedule } =
        await import("@/server/touch/services/upsert-subscription-renewal-reminder");
      await upsertSubscriptionRenewalReminderSchedule({ cycleId });
    });
    bus.on(
      "subscription:canceled",
      async ({ subscriptionId, cancelAtPeriodEnd }) => {
        try {
          const { db } = await import("@/server/db");
          const { cancelSubscriptionRenewalReminderSchedule } =
            await import("@/server/touch/services/cancel-subscription-renewal-reminder");

          const activeCycle = await db.userSubscriptionCycle.findFirst({
            where: {
              subscriptionId,
              ...(cancelAtPeriodEnd ? { status: "ACTIVE" as const } : {}),
              deletedAt: null,
            },
            orderBy: { sequenceNumber: "desc" },
          });

          if (activeCycle) {
            await cancelSubscriptionRenewalReminderSchedule({
              cycleId: activeCycle.id,
              reason: cancelAtPeriodEnd
                ? "cancel_at_period_end"
                : "cancelled_immediately",
            });
          }
        } catch (error) {
          log.warn({ error, subscriptionId }, "Touch cancel reminder failed");
        }
      },
    );
  },
};
