import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { appEvents } from "@/server/events/bus";
import { storeGeneratedImage } from "@/server/ai/image-generation/storage";
import { getImageGenerationProvider } from "@/server/ai/image-generation";
import { imageGenerationEstimateInputSchema } from "@/server/ai/image-generation/validators";
import type { ProviderPrediction } from "@/server/ai/image-generation/providers/types";
import type { ImageGenerationJobData } from "@/workers/queues/image-generation.queue";
import {
  PRISMA_TO_OPERATION,
  PRISMA_TO_PROVIDER,
  PRISMA_TO_STATUS,
  STATUS_TO_PRISMA,
  TERMINAL_IMAGE_GENERATION_STATUSES,
} from "@/server/ai/image-generation/types";

const logger = createLogger("image-generation-worker");

const PROVIDER_TIMEOUT_MS = 5 * 60 * 1000;

export async function processImageGenerationJob(
  job: Job<ImageGenerationJobData>,
): Promise<void> {
  if (job.data.type !== "run-task") return;

  const { taskId } = job.data;
  const task = await db.imageGenerationTask.findUnique({
    where: { id: taskId },
    include: { assets: true },
  });

  if (!task) {
    logger.warn({ taskId }, "Image generation task not found");
    return;
  }

  const currentStatus = PRISMA_TO_STATUS[task.status];
  if (TERMINAL_IMAGE_GENERATION_STATUSES.has(currentStatus)) {
    logger.info({ taskId, status: currentStatus }, "Skipping terminal task");
    return;
  }

  const providerId = PRISMA_TO_PROVIDER[task.provider];
  const provider = getImageGenerationProvider(providerId);
  const providerInput = imageGenerationEstimateInputSchema.parse({
    ...(task.request as Record<string, unknown>),
    provider: providerId,
    model: task.model,
    operation: PRISMA_TO_OPERATION[task.operation],
    prompt: task.prompt,
  });

  await db.imageGenerationTask.update({
    where: { id: task.id },
    data: {
      status: "RUNNING",
      startedAt: task.startedAt ?? new Date(),
      errorMessage: null,
    },
  });

  let prediction: ProviderPrediction;

  if (task.providerTaskId) {
    prediction = await provider.getPrediction(
      task.providerTaskId,
      task.providerTaskUrl ?? undefined,
    );
  } else {
    prediction = await provider.createPrediction(providerInput);
    await db.imageGenerationTask.update({
      where: { id: task.id },
      data: {
        providerTaskId: prediction.providerTaskId,
        providerTaskUrl: prediction.providerTaskUrl,
        providerRaw: toJson(prediction.providerRaw),
      },
    });
  }

  await job.updateProgress(20);

  const completedPrediction = await waitForProviderCompletion({
    taskId: task.id,
    initialPrediction: prediction,
    providerTaskUrl:
      prediction.providerTaskUrl ?? task.providerTaskUrl ?? undefined,
  });

  if (completedPrediction.status !== "succeeded") {
    await markFailed({
      taskId: task.id,
      userId: task.userId,
      provider: providerId,
      model: task.model,
      status: completedPrediction.status,
      errorMessage: completedPrediction.error ?? "Image generation failed",
      providerRaw: completedPrediction.providerRaw,
    });
    return;
  }

  await job.updateProgress(70);

  const savedAssetIds: string[] = [];
  const outputs = completedPrediction.outputs;

  if (outputs.length === 0) {
    await markFailed({
      taskId: task.id,
      userId: task.userId,
      provider: providerId,
      model: task.model,
      status: "failed",
      errorMessage: "Provider completed without image outputs",
      providerRaw: completedPrediction.providerRaw,
    });
    return;
  }

  for (const [index, sourceUrl] of outputs.entries()) {
    const existing = await db.imageGenerationAsset.findFirst({
      where: { taskId: task.id, sourceUrl },
      select: { id: true },
    });
    if (existing) {
      savedAssetIds.push(existing.id);
      continue;
    }

    const stored = await storeGeneratedImage({
      userId: task.userId,
      taskId: task.id,
      outputIndex: index,
      sourceUrl,
      outputFormat: providerInput.outputFormat,
    });

    const generationAsset = await db.$transaction(async (tx) => {
      const imageAsset = await tx.imageAsset.create({
        data: {
          userId: task.userId,
          projectId: task.projectId,
          storageKey: stored.storageKey,
          imageUrl: stored.publicUrl,
          contentType: stored.contentType,
          fileSize: stored.byteLength,
          type: task.operation === "EDIT_IMAGE" ? "edit" : "generate",
          prompt: task.prompt,
          model: task.model,
          size: readString(providerInput.resolution),
          ratio: readString(providerInput.aspectRatio),
          status: "completed",
          tags: ["image-generation", providerId],
        },
      });

      return tx.imageGenerationAsset.create({
        data: {
          taskId: task.id,
          userId: task.userId,
          projectId: task.projectId,
          imageAssetId: imageAsset.id,
          provider: task.provider,
          providerTaskId: completedPrediction.providerTaskId,
          model: task.model,
          status: "SUCCEEDED",
          prompt: task.prompt,
          sourceUrl: stored.sourceUrl,
          publicUrl: stored.publicUrl,
          storageKey: stored.storageKey,
          contentType: stored.contentType,
          byteLength: stored.byteLength,
          costUsd: task.costUsd ?? completedPrediction.costUsd,
          providerRaw: toJson(completedPrediction.providerRaw),
          metadata: task.metadata ? toJson(task.metadata) : undefined,
        },
      });
    });

    savedAssetIds.push(generationAsset.id);
  }

  await db.imageGenerationTask.update({
    where: { id: task.id },
    data: {
      status: "SUCCEEDED",
      completedAt: new Date(),
      providerRaw: toJson(completedPrediction.providerRaw),
      errorMessage: null,
    },
  });

  await appEvents.emit("image_generation:succeeded", {
    taskId: task.id,
    userId: task.userId,
    provider: providerId,
    model: task.model,
    assetIds: savedAssetIds,
  });

  await job.updateProgress(100);
}

async function waitForProviderCompletion(params: {
  taskId: string;
  initialPrediction: ProviderPrediction;
  providerTaskUrl?: string;
}): Promise<ProviderPrediction> {
  let prediction = params.initialPrediction;
  let interval = 2000;
  const startedAt = Date.now();
  const provider = getImageGenerationProvider(prediction.provider);

  while (Date.now() - startedAt < PROVIDER_TIMEOUT_MS) {
    if (TERMINAL_IMAGE_GENERATION_STATUSES.has(prediction.status)) {
      return prediction;
    }

    await wait(interval);
    prediction = await provider.getPrediction(
      prediction.providerTaskId,
      params.providerTaskUrl ?? prediction.providerTaskUrl,
    );

    await db.imageGenerationTask.update({
      where: { id: params.taskId },
      data: {
        providerRaw: toJson(prediction.providerRaw),
        providerTaskUrl: prediction.providerTaskUrl,
        status:
          prediction.status === "queued"
            ? "RUNNING"
            : STATUS_TO_PRISMA[prediction.status],
      },
    });

    interval = Math.min(30000, Math.ceil(interval * 1.5));
  }

  return {
    ...prediction,
    status: "timed_out",
    error: "Timed out waiting for provider result",
  };
}

async function markFailed(params: {
  taskId: string;
  userId: string;
  provider: string;
  model: string;
  status: "queued" | "running" | "failed" | "canceled" | "timed_out";
  errorMessage: string;
  providerRaw: unknown;
}): Promise<void> {
  const failureStatus =
    params.status === "canceled" || params.status === "timed_out"
      ? params.status
      : "failed";

  await db.imageGenerationTask.update({
    where: { id: params.taskId },
    data: {
      status: STATUS_TO_PRISMA[failureStatus],
      completedAt: new Date(),
      errorMessage: params.errorMessage,
      providerRaw: toJson(params.providerRaw),
    },
  });

  await appEvents.emit("image_generation:failed", {
    taskId: params.taskId,
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    errorMessage: params.errorMessage,
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
