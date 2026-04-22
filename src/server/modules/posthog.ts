import type { FrameworkModule } from "@/server/modules/registry";
import { getServerPostHog } from "@/analytics/server";
import { BILLING_EVENTS } from "@/analytics/events/billing";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:posthog");

export const posthogModule: FrameworkModule = {
  name: "posthog",
  enabled: true,

  registerEventHandlers(bus) {
    bus.on("payment:succeeded", async ({ paymentId, userId, gateway, amountCents, currency }) => {
      const posthog = getServerPostHog();
      if (!posthog) return;

      try {
        const payment = await db.payment.findUnique({
          where: { id: paymentId },
          include: {
            order: {
              include: {
                product: { include: { creditsPackage: true } },
                user: true,
              },
            },
          },
        });
        if (!payment?.order) return;

        const order = payment.order;
        const rawType = order.product?.type ?? "UNKNOWN";
        const productType =
          rawType === "SUBSCRIPTION"
            ? "subscription"
            : rawType === "CREDITS_PACKAGE"
              ? "credits"
              : rawType.toLowerCase();

        let priceVariant: string | undefined;
        if (order.product?.metadata && typeof order.product.metadata === "object") {
          const meta = order.product.metadata as { priceVariant?: string };
          priceVariant = meta.priceVariant;
        }

        const allFlags = await posthog.getAllFlags(userId);
        const featureFlagProps: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(allFlags)) {
          if (value !== undefined && value !== null) {
            featureFlagProps[`$feature/${key}`] = value;
          }
        }

        posthog.capture({
          distinctId: userId,
          event: BILLING_EVENTS.CREDITS_PURCHASE_SUCCESS,
          properties: {
            package_id: order.productId,
            credits: order.product?.creditsPackage?.creditsAmount ?? 0,
            currency,
            amount_cents: amountCents,
            amount: amountCents / 100,
            price: amountCents / 100,
            country_code: (order.user as { countryCode?: string | null })?.countryCode ?? null,
            gateway: gateway.toLowerCase(),
            order_id: order.id,
            payment_id: paymentId,
            product_type: productType,
            price_variant: priceVariant,
            ...featureFlagProps,
          },
        });
        await posthog.shutdown();
      } catch (error) {
        log.warn({ error, paymentId }, "PostHog capture failed");
      }
    });
  },
};
