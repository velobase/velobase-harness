import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:touch");

export const touchModule: FrameworkModule = {
  name: "touch",
  enabled: true,

  registerEventHandlers(bus) {
    bus.on("subscription:canceled", async ({ subscriptionId, cancelAtPeriodEnd }) => {
      if (!cancelAtPeriodEnd) return;

      try {
        const { db } = await import("@/server/db");
        const { cancelSubscriptionRenewalReminderSchedule } = await import(
          "@/server/touch/services/cancel-subscription-renewal-reminder"
        );

        const activeCycle = await db.userSubscriptionCycle.findFirst({
          where: { subscriptionId, status: "ACTIVE" },
          orderBy: { sequenceNumber: "desc" },
        });

        if (activeCycle) {
          await cancelSubscriptionRenewalReminderSchedule({
            cycleId: activeCycle.id,
            reason: "cancel_at_period_end",
          });
        }
      } catch (error) {
        log.warn({ error, subscriptionId }, "Touch cancel reminder failed");
      }
    });
  },
};
