import type {
  ImageGenerationOperation as PrismaImageGenerationOperation,
  ImageGenerationProvider as PrismaImageGenerationProvider,
  ImageGenerationTaskStatus as PrismaImageGenerationTaskStatus,
} from "@prisma/client";

export type ImageGenerationProviderId = "wavespeed";

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

export interface ImageGenerationCreateInput {
  provider: ImageGenerationProviderId;
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

export type ImageGenerationEstimateInput = Omit<
  ImageGenerationCreateInput,
  "userId" | "projectId" | "idempotencyKey" | "metadata"
>;

export interface ImageGenerationTask {
  id: string;
  provider: ImageGenerationProviderId;
  providerTaskId?: string;
  model: string;
  operation: ImageGenerationOperation;
  status: ImageGenerationStatus;
  prompt: string;
  costUsd?: number;
  metadata?: unknown;
  assets: ImageGenerationAsset[];
  providerRaw?: unknown;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ImageGenerationAsset = {
  id: string;
  provider: ImageGenerationProviderId;
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

export const PROVIDER_TO_PRISMA = {
  wavespeed: "WAVESPEED",
} as const satisfies Record<
  ImageGenerationProviderId,
  PrismaImageGenerationProvider
>;

export const PRISMA_TO_PROVIDER = {
  WAVESPEED: "wavespeed",
} as const satisfies Record<
  PrismaImageGenerationProvider,
  ImageGenerationProviderId
>;

export const OPERATION_TO_PRISMA = {
  "text-to-image": "TEXT_TO_IMAGE",
  "image-to-image": "IMAGE_TO_IMAGE",
  "edit-image": "EDIT_IMAGE",
} as const satisfies Record<
  ImageGenerationOperation,
  PrismaImageGenerationOperation
>;

export const PRISMA_TO_OPERATION = {
  TEXT_TO_IMAGE: "text-to-image",
  IMAGE_TO_IMAGE: "image-to-image",
  EDIT_IMAGE: "edit-image",
} as const satisfies Record<
  PrismaImageGenerationOperation,
  ImageGenerationOperation
>;

export const STATUS_TO_PRISMA = {
  queued: "QUEUED",
  running: "RUNNING",
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  canceled: "CANCELED",
  timed_out: "TIMED_OUT",
} as const satisfies Record<
  ImageGenerationStatus,
  PrismaImageGenerationTaskStatus
>;

export const PRISMA_TO_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
  TIMED_OUT: "timed_out",
} as const satisfies Record<
  PrismaImageGenerationTaskStatus,
  ImageGenerationStatus
>;

export const TERMINAL_IMAGE_GENERATION_STATUSES =
  new Set<ImageGenerationStatus>([
    "succeeded",
    "failed",
    "canceled",
    "timed_out",
  ]);
