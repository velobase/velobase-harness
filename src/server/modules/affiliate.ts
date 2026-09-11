import type { FrameworkModule } from "@/server/modules/registry";
import type { AppEventBus } from "@/server/events/bus";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:affiliate");

export const affiliateModule: FrameworkModule = {
  name: "affiliate",
  enabled: true,

  registerEventHandlers(bus: AppEventBus) {
    bus.on("user:signup", async ({ userId, referralCode }) => {
      if (!referralCode) return;
      const { bindNewUserReferral } =
        await import("@/modules/affiliate/server/referrals");
      await bindNewUserReferral(userId, referralCode);
    });

    bus.on("payment:succeeded", async ({ paymentId }) => {
      try {
        const { createAffiliateEarningForOrderPayment } =
          await import("@/server/affiliate/services/ledger");
        await createAffiliateEarningForOrderPayment(paymentId);
      } catch (error) {
        log.warn({ error, paymentId }, "Affiliate earning creation failed");
      }
    });

    bus.on("payment:refunded", async ({ paymentId, eventId }) => {
      try {
        const { voidAffiliateEarningsForRefund } =
          await import("@/server/affiliate/services/ledger");
        await voidAffiliateEarningsForRefund({
          paymentId,
          idempotencyKey: eventId ?? `event_bus:refund:${paymentId}`,
        });
      } catch (error) {
        log.warn({ error, paymentId }, "Affiliate earning void failed");
      }
    });

    bus.on("invoice:refunded", async ({ invoiceId, gateway, eventId }) => {
      if (gateway.toUpperCase() !== "STRIPE") return;
      const { voidAffiliateEarningsForStripeInvoiceRefund } =
        await import("@/server/affiliate/services/ledger");
      await voidAffiliateEarningsForStripeInvoiceRefund({
        invoiceId,
        idempotencyKey: eventId,
      });
    });

    bus.on(
      "subscription:renewed",
      async ({ subscriptionId, invoiceId, userId, amountCents, currency }) => {
        if (amountCents <= 0 || currency.toUpperCase() !== "USD") return;
        try {
          const { createAffiliateEarningForStripeSubscriptionRenewal } =
            await import("@/server/affiliate/services/ledger");
          await createAffiliateEarningForStripeSubscriptionRenewal({
            referredUserId: userId,
            subscriptionId,
            invoiceId,
            amountCents,
          });
        } catch (error) {
          log.warn(
            { error, subscriptionId },
            "Affiliate subscription renewal earning failed",
          );
        }
      },
    );
  },
};
