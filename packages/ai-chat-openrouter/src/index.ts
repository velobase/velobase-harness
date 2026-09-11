import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

/** Selected technical adapter; constructing it does not contact the provider. */
export function createOpenRouterChatModel(input: {
  apiKey: string;
  model: string;
}) {
  const config = z
    .object({
      apiKey: z.string().trim().min(1).max(4096),
      model: z.string().trim().min(1).max(256),
    })
    .parse(input);
  return createOpenRouter({ apiKey: config.apiKey })(config.model);
}
