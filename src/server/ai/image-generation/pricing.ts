import { createLogger } from "@/lib/logger";
import type { ImageGenerationEstimateInput } from "./types";
import { getImageGenerationProvider } from "./providers/registry";

const logger = createLogger("image-generation-pricing");

export async function estimateImageGenerationCost(
  input: ImageGenerationEstimateInput,
): Promise<number | undefined> {
  try {
    const provider = getImageGenerationProvider(input.provider);
    return await provider.estimateCost(input);
  } catch (error) {
    logger.warn(
      { err: error, provider: input.provider, model: input.model },
      "Image generation cost estimate failed",
    );
    return undefined;
  }
}
