import { env } from "@/env";
import type { ImageGenerationProviderId } from "../types";
import type { ImageGenerationProviderAdapter } from "./types";
import { AtlasCloudProvider } from "./atlascloud";
import { ModelrunnerProvider } from "./modelrunner";
import { WavespeedProvider } from "./wavespeed";

import { ImageGenerationProviderRegistry } from "@velobase/image-generation/providers";

export const imageGenerationProviderRegistry =
  new ImageGenerationProviderRegistry<ImageGenerationProviderId>();

let defaultsRegistered = false;

export function registerDefaultImageGenerationProviders(): void {
  if (defaultsRegistered) return;

  if (env.WAVESPEED_API_KEY) {
    imageGenerationProviderRegistry.register(new WavespeedProvider());
  }

  if (env.MODELRUNNER_KEY) {
    imageGenerationProviderRegistry.register(new ModelrunnerProvider());
  }

  if (env.ATLASCLOUD_API_KEY) {
    imageGenerationProviderRegistry.register(new AtlasCloudProvider());
  }

  defaultsRegistered = true;
}

export function getImageGenerationProvider(
  provider: ImageGenerationProviderId,
): ImageGenerationProviderAdapter {
  registerDefaultImageGenerationProviders();
  return imageGenerationProviderRegistry.get(provider);
}
