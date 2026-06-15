import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";
import { registerDefaultImageGenerationProviders } from "@/server/ai/image-generation";

const log = createLogger("module:image-generation");

export const imageGenerationModule: FrameworkModule = {
  name: "image-generation",
  enabled: true,

  async onInit() {
    registerDefaultImageGenerationProviders();
    log.info("Image generation module loaded");
  },
};
