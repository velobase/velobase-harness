export type ImageGenerationProviderId = string;

export type ImageGenerationOperation =
  | "text-to-image"
  | "image-to-image"
  | "edit-image";

export type ImageGenerationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timed_out";

export type ImageGenerationOutputFormat = "png" | "jpeg" | "webp";

export interface ImageGenerationCreateInput<P extends string = string> {
  provider: P;
  model: string;
  operation: ImageGenerationOperation;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  quality?: "low" | "medium" | "high";
  resolution?: "1k" | "2k" | "4k";
  outputFormat?: ImageGenerationOutputFormat;
  imageUrls?: string[];
  userId: string;
  projectId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export type ImageGenerationEstimateInput<P extends string = string> = Omit<
  ImageGenerationCreateInput<P>,
  "userId" | "projectId" | "idempotencyKey" | "metadata"
>;

export interface ImageGenerationTask<P extends string = string> {
  id: string;
  provider: P;
  providerTaskId?: string;
  model: string;
  operation: ImageGenerationOperation;
  status: ImageGenerationStatus;
  prompt: string;
  costUsd?: number;
  metadata?: unknown;
  assets: ImageGenerationAsset<P>[];
  providerRaw?: unknown;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ImageGenerationAsset<P extends string = string> = {
  id: string;
  provider: P;
  providerTaskId?: string;
  model: string;
  status: "succeeded" | "failed";
  prompt: string;
  sourceUrl?: string;
  publicUrl?: string;
  storageKey?: string;
  contentType?: string;
  byteLength?: number;
  costUsd?: number;
  providerRaw?: unknown;
};

export const TERMINAL_IMAGE_GENERATION_STATUSES =
  new Set<ImageGenerationStatus>([
    "succeeded",
    "failed",
    "canceled",
    "timed_out",
  ]);
