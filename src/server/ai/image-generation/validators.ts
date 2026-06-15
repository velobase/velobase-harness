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

export const imageGenerationProviderSchema = z.enum(["wavespeed"]);

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
  provider: imageGenerationProviderSchema.default("wavespeed"),
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

export const imageGenerationToolInputSchema = z.object({
  prompt: z.string().min(1).max(8000).describe("Image generation prompt."),
  model: z
    .string()
    .min(1)
    .default("openai/gpt-image-2/text-to-image")
    .describe("WaveSpeed model id."),
  aspectRatio: z
    .string()
    .optional()
    .default("1:1")
    .describe("Aspect ratio such as 1:1, 16:9, or 9:16."),
  quality: imageGenerationQualitySchema.default("medium"),
  resolution: imageGenerationResolutionSchema.default("1k"),
  outputFormat: imageGenerationOutputFormatSchema.default("png"),
  providerOptions: providerOptionsSchema,
});

export const imageEditToolInputSchema = z.object({
  imageUrl: z.string().url().describe("Source image URL."),
  instruction: z.string().min(1).max(8000).describe("Edit instruction."),
  model: z
    .string()
    .min(1)
    .default("openai/gpt-image-2/edit")
    .describe("WaveSpeed edit model id."),
  aspectRatio: z.string().optional(),
  quality: imageGenerationQualitySchema.default("medium"),
  resolution: imageGenerationResolutionSchema.default("1k"),
  outputFormat: imageGenerationOutputFormatSchema.default("png"),
  providerOptions: providerOptionsSchema,
});

export type ImageGenerationToolInput = z.infer<
  typeof imageGenerationToolInputSchema
>;

export type ImageEditToolInput = z.infer<typeof imageEditToolInputSchema>;
