import type {
  ImageGenerationOperation as PrismaImageGenerationOperation,
  ImageGenerationProvider as PrismaImageGenerationProvider,
  ImageGenerationTaskStatus as PrismaImageGenerationTaskStatus,
} from "@prisma/client";

import type {
  ImageGenerationCreateInput as CreateInput,
  ImageGenerationEstimateInput as EstimateInput,
  ImageGenerationTask as Task,
  ImageGenerationAsset as Asset,
  ImageGenerationOperation,
  ImageGenerationStatus,
} from "@velobase/image-generation/types";
export type {
  ImageGenerationOperation,
  ImageGenerationStatus,
  ImageGenerationOutputFormat,
} from "@velobase/image-generation/types";
export { TERMINAL_IMAGE_GENERATION_STATUSES } from "@velobase/image-generation/types";
export type ImageGenerationProviderId = "wavespeed" | "modelrunner";
export type ImageGenerationCreateInput = CreateInput<ImageGenerationProviderId>;
export type ImageGenerationEstimateInput =
  EstimateInput<ImageGenerationProviderId>;
export type ImageGenerationTask = Task<ImageGenerationProviderId>;
export type ImageGenerationAsset = Asset<ImageGenerationProviderId>;

export const PROVIDER_TO_PRISMA = {
  wavespeed: "WAVESPEED",
  modelrunner: "MODELRUNNER",
} as const satisfies Record<
  ImageGenerationProviderId,
  PrismaImageGenerationProvider
>;

export const PRISMA_TO_PROVIDER = {
  WAVESPEED: "wavespeed",
  MODELRUNNER: "modelrunner",
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
