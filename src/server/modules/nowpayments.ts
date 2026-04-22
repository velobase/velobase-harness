import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:nowpayments");

export const nowpaymentsModule: FrameworkModule = {
  name: "nowpayments",
  enabled: true,

  async onInit() {
    log.info("NowPayments module loaded");
  },
};
