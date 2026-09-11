import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import {
  ModelrunnerProvider as Provider,
  type ModelrunnerConfiguration,
} from "@velobase/image-generation-modelrunner";
/** Complete-example connection selection; the adapter itself does not read host env. */
export class ModelrunnerProvider extends Provider {
  constructor(
    config: ModelrunnerConfiguration = {
      apiKey: env.MODELRUNNER_KEY ?? "",
      queueUrl: env.MODELRUNNER_QUEUE_URL,
      baseUrl: env.MODELRUNNER_BASE_URL,
      timeoutMs: env.MODELRUNNER_REQUEST_TIMEOUT_MS,
      logger: createLogger("modelrunner-provider"),
    },
  ) {
    super(config);
  }
}
