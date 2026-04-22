import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:affiliate");

export const affiliateModule: FrameworkModule = {
  name: "affiliate",
  enabled: true,

  registerEventHandlers(bus) {
    bus.on("payment:succeeded", async ({ paymentId }) => {
      try {
        const { createAffiliateEarningForOrderPayment } = await import(
          "@/server/affiliate/services/ledger"
        );
        await createAffiliateEarningForOrderPayment(paymentId);
      } catch (error) {
        log.warn({ error, paymentId }, "Affiliate earning creation failed");
      }
    });

    bus.on("payment:refunded", async ({ paymentId }) => {
      try {
        const { voidAffiliateEarningsForRefund } = await import(
          "@/server/affiliate/services/ledger"
        );
        await voidAffiliateEarningsForRefund({
          paymentId,
          idempotencyKey: `event_bus:refund:${paymentId}`,
        });
      } catch (error) {
        log.warn({ error, paymentId }, "Affiliate earning void failed");
      }
    });

    bus.on("subscription:renewed", async ({ subscriptionId, userId, amountCents, currency }) => {
      if (amountCents <= 0) return;
      try {
        const { createAffiliateEarningForStripeSubscriptionRenewal } = await import(
          "@/server/affiliate/services/ledger"
        );
        await createAffiliateEarningForStripeSubscriptionRenewal({
          referredUserId: userId,
          subscriptionId,
          invoiceId: `event_bus:renewal:${subscriptionId}:${Date.now()}`,
          amountCents,
          currency,
        });
      } catch (error) {
        log.warn({ error, subscriptionId }, "Affiliate subscription renewal earning failed");
      }
    });
  },

};
