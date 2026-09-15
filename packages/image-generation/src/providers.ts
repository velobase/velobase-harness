import type {
  ImageGenerationEstimateInput,
  ImageGenerationOperation,
  ImageGenerationOutputFormat,
  ImageGenerationProviderId,
  ImageGenerationStatus,
} from "./types";

export interface ProviderImageGenerationInput {
  model: string;
  operation: ImageGenerationOperation;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  quality?: "low" | "medium" | "high";
  resolution?: "1k" | "2k" | "4k";
  outputFormat?: ImageGenerationOutputFormat;
  imageUrls?: string[];
  providerOptions?: Record<string, unknown>;
}

export interface ProviderPrediction<P extends string = string> {
  provider: P;
  providerTaskId: string;
  providerTaskUrl?: string;
  model: string;
  status: ImageGenerationStatus;
  outputs: string[];
  error?: string;
  costUsd?: number;
  providerRaw: unknown;
  createdAt?: string;
  timings?: Record<string, unknown>;
}

export interface ProviderModel {
  id: string;
  name: string;
  type?: string;
  basePriceUsd?: number;
  description?: string;
  providerRaw?: unknown;
}

export interface ProviderCapabilities<P extends string = string> {
  provider: P;
  operations: ImageGenerationOperation[];
  outputFormats: ImageGenerationOutputFormat[];
  qualities: Array<"low" | "medium" | "high">;
  resolutions: Array<"1k" | "2k" | "4k">;
  supportsProviderOptions: boolean;
  supportsPricing: boolean;
  supportsModelListing: boolean;
}

export interface ImageGenerationProviderAdapter<P extends string = string> {
  id: P;
  createPrediction(
    input: ProviderImageGenerationInput,
  ): Promise<ProviderPrediction<P>>;
  getPrediction(
    providerTaskId: string,
    providerTaskUrl?: string,
  ): Promise<ProviderPrediction<P>>;
  estimateCost(
    input: ImageGenerationEstimateInput,
  ): Promise<number | undefined>;
  listModels(): Promise<ProviderModel[]>;
  getCapabilities(): ProviderCapabilities<P>;
}

export class ImageGenerationProviderError extends Error {
  constructor(
    message: string,
    public readonly details: {
      provider: ImageGenerationProviderId;
      httpStatus?: number;
      code?: string | number;
      retryable?: boolean;
      providerRaw?: unknown;
    },
  ) {
    super(message);
    this.name = "ImageGenerationProviderError";
  }
}

export class ImageGenerationProviderRegistry<P extends string = string> {
  private providers = new Map<P, ImageGenerationProviderAdapter<P>>();

  register(provider: ImageGenerationProviderAdapter<P>): void {
    this.providers.set(provider.id, provider);
  }

  get(provider: string): ImageGenerationProviderAdapter<P> {
    const adapter = this.providers.get(provider as P);
    if (!adapter) {
      throw new Error(
        `Image generation provider is not configured: ${provider}`,
      );
    }
    return adapter;
  }

  list(): ImageGenerationProviderAdapter<P>[] {
    return Array.from(this.providers.values());
  }

  has(provider: string): boolean {
    return this.providers.has(provider as P);
  }
}
