import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("module:ai-chat");

export const aiChatModule: FrameworkModule = {
  name: "ai-chat",
  enabled: true,

  async onInit() {
    log.info("AI Chat module loaded");
  },
};
