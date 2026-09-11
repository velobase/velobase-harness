import type { ImageGenerationProviderId } from "../types";
import type {
  ImageGenerationProviderAdapter as Adapter,
  ProviderPrediction as Prediction,
  ProviderCapabilities as Capabilities,
} from "@velobase/image-generation/providers";
export { ImageGenerationProviderError } from "@velobase/image-generation/providers";
export type {
  ProviderImageGenerationInput,
  ProviderModel,
} from "@velobase/image-generation/providers";
export type ImageGenerationProviderAdapter = Adapter<ImageGenerationProviderId>;
export type ProviderPrediction = Prediction<ImageGenerationProviderId>;
export type ProviderCapabilities = Capabilities<ImageGenerationProviderId>;
