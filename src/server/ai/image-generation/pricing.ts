import type { ImageGenerationEstimateInput } from "./types";
import { imageGeneration } from "./service";
export function estimateImageGenerationCost(
  input: ImageGenerationEstimateInput,
): Promise<number | undefined> {
  return imageGeneration.estimateCost(input);
}
