import { tool } from "ai";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import {
  imageEditToolInputSchema,
  imageGenerationToolInputSchema,
} from "@/server/ai/image-generation/validators";
import type { ToolContext } from "./registry";

const logger = createLogger("image-generation-tools");

export function createGenerateImageTool(context?: ToolContext) {
  return tool({
    description:
      "Generate an image with the framework image generation service. Use this when the user asks to create a new image, visual, illustration, cover, product image, or marketing image.",
    inputSchema: imageGenerationToolInputSchema,
    execute: async (input) => {
      const userId = readString(context?.userId);
      if (!userId) {
        return {
          success: false,
          message: "Image generation requires an authenticated user.",
        };
      }

      try {
        const { imageGeneration } =
          await import("@/server/ai/image-generation");
        const asset = await imageGeneration.generateImage(
          {
            provider: "wavespeed",
            model: input.model,
            operation: "text-to-image",
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            userId,
            projectId: readString(context?.projectId),
            metadata: {
              source: "ai-chat",
              conversationId: context?.conversationId,
            },
            providerOptions: input.providerOptions,
          },
          { timeoutMs: 300000 },
        );

        return {
          success: true,
          image_url: asset.publicUrl ?? asset.sourceUrl,
          image_id: asset.id,
          task_provider_id: asset.providerTaskId,
          model: asset.model,
          provider: asset.provider,
          cost_usd: asset.costUsd,
          message: "Image generated successfully.",
        };
      } catch (error) {
        logger.error({ err: error }, "Generate image tool failed");
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Image generation failed.",
        };
      }
    },
  });
}

export function createEditImageTool(context?: ToolContext) {
  return tool({
    description:
      "Edit an existing image through the framework image generation service. Use when the user provides an image URL and asks for changes.",
    inputSchema: imageEditToolInputSchema,
    execute: async (input) => {
      const userId = readString(context?.userId);
      if (!userId) {
        return {
          success: false,
          message: "Image editing requires an authenticated user.",
        };
      }

      try {
        const { imageGeneration } =
          await import("@/server/ai/image-generation");
        const asset = await imageGeneration.generateImage(
          {
            provider: "wavespeed",
            model: input.model,
            operation: "edit-image",
            prompt: input.instruction,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            imageUrls: [input.imageUrl],
            userId,
            projectId: readString(context?.projectId),
            metadata: {
              source: "ai-chat",
              conversationId: context?.conversationId,
              parentImageUrl: input.imageUrl,
            },
            providerOptions: input.providerOptions,
          },
          { timeoutMs: 300000 },
        );

        return {
          success: true,
          image_url: asset.publicUrl ?? asset.sourceUrl,
          parentImageUrl: input.imageUrl,
          image_id: asset.id,
          task_provider_id: asset.providerTaskId,
          model: asset.model,
          provider: asset.provider,
          cost_usd: asset.costUsd,
          message: "Image edited successfully.",
        };
      } catch (error) {
        logger.error({ err: error }, "Edit image tool failed");
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Image edit failed.",
        };
      }
    },
  });
}

export function createListProjectImagesTool(context?: ToolContext) {
  return tool({
    description: "List images in the current project image gallery.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).default(10),
    }),
    execute: async ({ limit }) => {
      const projectId = readString(context?.projectId);
      const userId = readString(context?.userId);

      if (!projectId) {
        return {
          success: false,
          error: "Missing project context.",
          images: [],
          total: 0,
        };
      }

      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (!project) {
        return {
          success: false,
          error: "Project not found.",
          images: [],
          total: 0,
        };
      }

      if (userId && project.userId !== userId) {
        return {
          success: false,
          error: "Project access denied.",
          images: [],
          total: 0,
        };
      }

      const [images, total] = await Promise.all([
        db.imageAsset.findMany({
          where: { projectId },
          select: {
            id: true,
            imageUrl: true,
            prompt: true,
            model: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        db.imageAsset.count({ where: { projectId } }),
      ]);

      return {
        success: true,
        images: images.map((image) => ({
          id: image.id,
          image_url: image.imageUrl,
          prompt: image.prompt,
          model: image.model,
          createdAt: image.createdAt.toISOString(),
        })),
        total,
      };
    },
  });
}

export function createImageGenerationTools(context?: ToolContext) {
  return {
    generate_image: createGenerateImageTool(context),
    edit_image: createEditImageTool(context),
    list_project_images: createListProjectImagesTool(context),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
