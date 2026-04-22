import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:telegram");

export const telegramModule: FrameworkModule = {
  name: "telegram",
  enabled: true,

  async onInit() {
    log.info("Telegram module loaded");
  },
};
