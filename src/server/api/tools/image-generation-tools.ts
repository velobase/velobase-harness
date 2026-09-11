import { createHash } from "node:crypto";
import { ImageGenerationWaitTimeoutError } from "@velobase/image-generation";
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
    execute: async (input, { toolCallId }) => {
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
            idempotencyKey: imageRequestKey(
              userId,
              context?.conversationId,
              toolCallId,
              "generate",
            ),
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
        if (error instanceof ImageGenerationWaitTimeoutError)
          return pendingImageTask(error.taskId);
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
    execute: async (input, { toolCallId }) => {
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
            idempotencyKey: imageRequestKey(
              userId,
              context?.conversationId,
              toolCallId,
              "edit",
            ),
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
        if (error instanceof ImageGenerationWaitTimeoutError)
          return pendingImageTask(error.taskId);
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
    get_image_task: createImageTaskStatusTool(context),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function imageRequestKey(
  userId: string,
  conversationId: unknown,
  toolCallId: string,
  operation: string,
): string {
  return `chat-image:${createHash("sha256")
    .update(
      JSON.stringify([userId, conversationId ?? null, toolCallId, operation]),
    )
    .digest("hex")}`;
}
function pendingImageTask(taskId: string) {
  return {
    success: false,
    pending: true,
    task_id: taskId,
    message:
      "The existing image task is still pending or its submission outcome needs reconciliation. Use get_image_task to inspect this task. Do not start another generation for the same request.",
  };
}
export function createImageTaskStatusTool(context?: ToolContext) {
  return tool({
    description:
      "Read an existing owned image task and resume result collection without submitting another generation.",
    inputSchema: z.object({ taskId: z.string().min(1).max(256) }),
    execute: async ({ taskId }) => {
      const userId = readString(context?.userId);
      if (!userId)
        return { success: false, message: "Authentication required." };
      const { imageGeneration } = await import("@/server/ai/image-generation");
      const task = await imageGeneration.getTask(taskId, { userId });
      if (!task) return { success: false, message: "Image task not found." };
      if (task.status === "queued" || task.status === "running") {
        const { enqueueImageGenerationTask } =
          await import("@/workers/queues/image-generation.queue");
        await enqueueImageGenerationTask(task.id);
        return { ...pendingImageTask(task.id), status: task.status };
      }
      return {
        success: task.status === "succeeded",
        task_id: task.id,
        status: task.status,
        images: task.assets
          .filter((asset) => asset.status === "succeeded")
          .map((asset) => ({
            image_id: asset.id,
            image_url: asset.publicUrl ?? asset.sourceUrl,
          })),
      };
    },
  });
}
