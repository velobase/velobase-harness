import type { FrameworkModule } from "@/server/modules/registry";
import { createLogger } from "@/lib/logger";
import { getVelobaseGatewayConfig } from "@/server/ai/velobase-gateway";

const log = createLogger("module:velobase-gateway");

export const velobaseGatewayModule: FrameworkModule = {
  name: "velobase-gateway",
  enabled: true,

  async onInit() {
    const config = getVelobaseGatewayConfig();
    log.info(
      {
        baseURL: config.baseURL,
        keyKind: config.keyKind,
        defaultModel: config.defaultModel,
      },
      "Velobase Gateway module loaded",
    );
  },
};
