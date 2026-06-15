import type {
  ImageGenerationEstimateInput,
  ImageGenerationOperation,
  ImageGenerationOutputFormat,
  ImageGenerationProviderId,
  ImageGenerationStatus,
} from "../types";

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

export interface ProviderPrediction {
  provider: ImageGenerationProviderId;
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

export interface ProviderCapabilities {
  provider: ImageGenerationProviderId;
  operations: ImageGenerationOperation[];
  outputFormats: ImageGenerationOutputFormat[];
  qualities: Array<"low" | "medium" | "high">;
  resolutions: Array<"1k" | "2k" | "4k">;
  supportsProviderOptions: boolean;
  supportsPricing: boolean;
  supportsModelListing: boolean;
}

export interface ImageGenerationProviderAdapter {
  id: ImageGenerationProviderId;
  createPrediction(
    input: ProviderImageGenerationInput,
  ): Promise<ProviderPrediction>;
  getPrediction(
    providerTaskId: string,
    providerTaskUrl?: string,
  ): Promise<ProviderPrediction>;
  estimateCost(
    input: ImageGenerationEstimateInput,
  ): Promise<number | undefined>;
  listModels(): Promise<ProviderModel[]>;
  getCapabilities(): ProviderCapabilities;
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
