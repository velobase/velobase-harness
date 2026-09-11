import { z } from "zod";

const providerOptionsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Provider-specific input fields forwarded to the selected provider.",
  );

const metadataSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Business metadata stored by the framework and never sent to providers.",
  );

export const imageGenerationProviderSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

export const imageGenerationOperationSchema = z.enum([
  "text-to-image",
  "image-to-image",
  "edit-image",
]);

export const imageGenerationOutputFormatSchema = z.enum([
  "png",
  "jpeg",
  "webp",
]);

export const imageGenerationQualitySchema = z.enum(["low", "medium", "high"]);

export const imageGenerationResolutionSchema = z.enum(["1k", "2k", "4k"]);

export const imageGenerationCreateInputSchema = z.object({
  provider: imageGenerationProviderSchema,
  model: z.string().min(1).max(200),
  operation: imageGenerationOperationSchema.default("text-to-image"),
  prompt: z.string().min(1).max(8000),
  negativePrompt: z.string().max(4000).optional(),
  aspectRatio: z.string().min(1).max(20).optional(),
  quality: imageGenerationQualitySchema.optional(),
  resolution: imageGenerationResolutionSchema.optional(),
  outputFormat: imageGenerationOutputFormatSchema.optional(),
  imageUrls: z.array(z.string().url()).max(8).optional(),
  userId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  metadata: metadataSchema,
  providerOptions: providerOptionsSchema,
});

export const imageGenerationEstimateInputSchema =
  imageGenerationCreateInputSchema.omit({
    userId: true,
    projectId: true,
    idempotencyKey: true,
    metadata: true,
  });
