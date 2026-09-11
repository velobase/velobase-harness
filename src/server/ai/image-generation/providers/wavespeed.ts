import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import {
  WavespeedProvider as Provider,
  type WavespeedConfiguration,
} from "@velobase/image-generation-wavespeed";
/** Complete-example connection selection; the adapter itself does not read host env. */
export class WavespeedProvider extends Provider {
  constructor(
    config: WavespeedConfiguration = {
      apiKey: env.WAVESPEED_API_KEY ?? "",
      baseUrl: env.WAVESPEED_BASE_URL,
      timeoutMs: env.WAVESPEED_REQUEST_TIMEOUT_MS,
      logger: createLogger("wavespeed-provider"),
    },
  ) {
    super(config);
  }
}
