import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { enqueueImageGenerationTask } from "@/workers/queues";
import { estimateImageGenerationCost } from "./pricing";
import {
  imageGenerationCreateInputSchema,
  imageGenerationEstimateInputSchema,
} from "./validators";
import { getImageGenerationProvider } from "./providers/registry";
import type { ProviderModel } from "./providers/types";
import type {
  ImageGenerationAsset,
  ImageGenerationCreateInput,
  ImageGenerationEstimateInput,
  ImageGenerationProviderId,
  ImageGenerationTask,
} from "./types";
import {
  OPERATION_TO_PRISMA,
  PRISMA_TO_OPERATION,
  PRISMA_TO_PROVIDER,
  PRISMA_TO_STATUS,
  PROVIDER_TO_PRISMA,
  TERMINAL_IMAGE_GENERATION_STATUSES,
} from "./types";

const logger = createLogger("image-generation-service");

type TaskWithAssets = Prisma.ImageGenerationTaskGetPayload<{
  include: { assets: true };
}>;

export class ImageGenerationService {
  async estimateCost(
    rawInput: ImageGenerationEstimateInput,
  ): Promise<number | undefined> {
    const input = imageGenerationEstimateInputSchema.parse(rawInput);
    return estimateImageGenerationCost(input);
  }

  async createTask(
    rawInput: ImageGenerationCreateInput,
  ): Promise<ImageGenerationTask> {
    const input = imageGenerationCreateInputSchema.parse(rawInput);

    await this.assertProjectAccess(input.userId, input.projectId);

    if (input.idempotencyKey) {
      const existing = await db.imageGenerationTask.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { assets: true },
      });

      if (existing) {
        const status = PRISMA_TO_STATUS[existing.status];
        if (!TERMINAL_IMAGE_GENERATION_STATUSES.has(status)) {
          await enqueueImageGenerationTask(existing.id);
        }
        return mapTask(existing);
      }
    }

    const costUsd = await estimateImageGenerationCost(input);
    const request = toJson({
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      resolution: input.resolution,
      outputFormat: input.outputFormat,
      imageUrls: input.imageUrls,
      providerOptions: input.providerOptions,
    });

    const task = await db.imageGenerationTask.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        provider: PROVIDER_TO_PRISMA[input.provider],
        model: input.model,
        operation: OPERATION_TO_PRISMA[input.operation],
        status: "QUEUED",
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        request,
        providerOptions: input.providerOptions
          ? toJson(input.providerOptions)
          : undefined,
        idempotencyKey: input.idempotencyKey,
        costUsd,
        metadata: input.metadata ? toJson(input.metadata) : undefined,
      },
      include: { assets: true },
    });

    await enqueueImageGenerationTask(task.id);

    logger.info(
      { taskId: task.id, provider: input.provider, model: input.model },
      "Image generation task created",
    );

    return mapTask(task);
  }

  async getTask(
    taskId: string,
    options: { userId?: string } = {},
  ): Promise<ImageGenerationTask | null> {
    const task = await db.imageGenerationTask.findUnique({
      where: { id: taskId },
      include: { assets: true },
    });

    if (!task) return null;
    if (options.userId && task.userId !== options.userId) {
      throw new Error("Image generation task access denied");
    }

    return mapTask(task);
  }

  async waitForTask(
    taskId: string,
    options: {
      userId?: string;
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {},
  ): Promise<ImageGenerationTask> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 300000;
    const pollIntervalMs = options.pollIntervalMs ?? 2000;

    while (Date.now() - startedAt < timeoutMs) {
      const task = await this.getTask(taskId, { userId: options.userId });
      if (!task) throw new Error("Image generation task not found");

      if (TERMINAL_IMAGE_GENERATION_STATUSES.has(task.status)) {
        return task;
      }

      await wait(pollIntervalMs);
    }

    await db.imageGenerationTask.update({
      where: { id: taskId },
      data: {
        status: "TIMED_OUT",
        completedAt: new Date(),
        errorMessage: "Timed out waiting for image generation task",
      },
    });

    const timedOutTask = await this.getTask(taskId, { userId: options.userId });
    if (!timedOutTask) throw new Error("Image generation task not found");
    return timedOutTask;
  }

  async generateImage(
    input: ImageGenerationCreateInput,
    options: { timeoutMs?: number } = {},
  ): Promise<ImageGenerationAsset> {
    const task = await this.createTask(input);
    const finished = await this.waitForTask(task.id, {
      userId: input.userId,
      timeoutMs: options.timeoutMs,
    });

    if (finished.status !== "succeeded") {
      throw new Error(
        finished.errorMessage ?? "Image generation task did not succeed",
      );
    }

    const asset = finished.assets.find((item) => item.status === "succeeded");
    if (!asset) {
      throw new Error("Image generation task succeeded without an asset");
    }

    return asset;
  }

  async listModels(
    providerId: ImageGenerationProviderId,
  ): Promise<ProviderModel[]> {
    const provider = getImageGenerationProvider(providerId);
    const models = await provider.listModels();
    return models.filter((model) => model.type?.includes("image"));
  }

  getCapabilities(providerId: ImageGenerationProviderId) {
    return getImageGenerationProvider(providerId).getCapabilities();
  }

  private async assertProjectAccess(
    userId: string,
    projectId: string | undefined,
  ): Promise<void> {
    if (!projectId) return;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.userId !== userId) {
      throw new Error("Project access denied");
    }
  }
}

export const imageGeneration = new ImageGenerationService();

function mapTask(task: TaskWithAssets): ImageGenerationTask {
  return {
    id: task.id,
    provider: PRISMA_TO_PROVIDER[task.provider],
    providerTaskId: task.providerTaskId ?? undefined,
    model: task.model,
    operation: PRISMA_TO_OPERATION[task.operation],
    status: PRISMA_TO_STATUS[task.status],
    prompt: task.prompt,
    costUsd: task.costUsd ?? undefined,
    metadata: task.metadata ?? undefined,
    assets: task.assets.map(mapAsset),
    providerRaw: task.providerRaw ?? undefined,
    errorMessage: task.errorMessage ?? undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function mapAsset(
  asset: TaskWithAssets["assets"][number],
): ImageGenerationAsset {
  const status =
    PRISMA_TO_STATUS[asset.status] === "succeeded" ? "succeeded" : "failed";

  return {
    id: asset.id,
    provider: PRISMA_TO_PROVIDER[asset.provider],
    providerTaskId: asset.providerTaskId ?? undefined,
    model: asset.model,
    status,
    prompt: asset.prompt,
    sourceUrl: asset.sourceUrl ?? undefined,
    publicUrl: asset.publicUrl ?? undefined,
    storageKey: asset.storageKey ?? undefined,
    contentType: asset.contentType ?? undefined,
    byteLength: asset.byteLength ?? undefined,
    costUsd: asset.costUsd ?? undefined,
    providerRaw: asset.providerRaw ?? undefined,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
