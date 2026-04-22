import type { FrameworkModule } from "@/server/modules/registry";
import { enqueueGoogleAdsUploadsForPayment } from "@/server/ads/google-ads/queue";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:google-ads");

export const googleAdsModule: FrameworkModule = {
  name: "google-ads",
  enabled: true,

  registerEventHandlers(bus) {
    bus.on("payment:succeeded", async ({ paymentId }) => {
      try {
        await enqueueGoogleAdsUploadsForPayment(paymentId);
      } catch (error) {
        log.warn({ error, paymentId }, "Google Ads upload enqueue failed");
      }
    });
  },
};
