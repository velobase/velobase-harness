import { env } from "@/env";
import type { ImageGenerationProviderId } from "../types";
import type { ImageGenerationProviderAdapter } from "./types";
import { WavespeedProvider } from "./wavespeed";

class ImageGenerationProviderRegistry {
  private providers = new Map<
    ImageGenerationProviderId,
    ImageGenerationProviderAdapter
  >();

  register(provider: ImageGenerationProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(provider: ImageGenerationProviderId): ImageGenerationProviderAdapter {
    const adapter = this.providers.get(provider);
    if (!adapter) {
      throw new Error(
        `Image generation provider is not configured: ${provider}`,
      );
    }
    return adapter;
  }

  list(): ImageGenerationProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  has(provider: ImageGenerationProviderId): boolean {
    return this.providers.has(provider);
  }
}

export const imageGenerationProviderRegistry =
  new ImageGenerationProviderRegistry();

let defaultsRegistered = false;

export function registerDefaultImageGenerationProviders(): void {
  if (defaultsRegistered) return;
  defaultsRegistered = true;

  if (env.WAVESPEED_API_KEY) {
    imageGenerationProviderRegistry.register(new WavespeedProvider());
  }
}

export function getImageGenerationProvider(
  provider: ImageGenerationProviderId,
): ImageGenerationProviderAdapter {
  registerDefaultImageGenerationProviders();
  return imageGenerationProviderRegistry.get(provider);
}
