import { z } from "zod";
import {
  imageGenerationCreateInputSchema as createInputSchema,
  imageGenerationQualitySchema,
  imageGenerationResolutionSchema,
  imageGenerationOutputFormatSchema,
} from "@velobase/image-generation/validators";
export {
  imageGenerationOperationSchema,
  imageGenerationQualitySchema,
  imageGenerationResolutionSchema,
  imageGenerationOutputFormatSchema,
} from "@velobase/image-generation/validators";
export const imageGenerationProviderSchema = z.enum([
  "wavespeed",
  "modelrunner",
]);
export const imageGenerationCreateInputSchema = createInputSchema.extend({
  provider: imageGenerationProviderSchema.default("wavespeed"),
});
export const imageGenerationEstimateInputSchema =
  imageGenerationCreateInputSchema.omit({
    userId: true,
    projectId: true,
    idempotencyKey: true,
    metadata: true,
  });
const providerOptionsSchema = z.record(z.unknown()).optional();

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
