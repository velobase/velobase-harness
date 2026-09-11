import { createHash } from "node:crypto";
import { DelayedError, type Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import {
  processImageGenerationTask,
  type ImageProcessingTask,
} from "@velobase/image-generation";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";
import { appEvents } from "@/server/events/bus";
import { storeGeneratedImage } from "@/server/ai/image-generation/storage";
import { getImageGenerationProvider } from "@/server/ai/image-generation/providers/registry";
import { imageGenerationEstimateInputSchema } from "@/server/ai/image-generation/validators";
import type { ImageGenerationProviderId } from "@/server/ai/image-generation/types";
import type { ImageGenerationJobData } from "@/workers/queues/image-generation.queue";
import {
  PRISMA_TO_OPERATION,
  PRISMA_TO_PROVIDER,
  PRISMA_TO_STATUS,
  STATUS_TO_PRISMA,
} from "@/server/ai/image-generation/types";
const logger = createLogger("image-generation-worker");
type Row = Prisma.ImageGenerationTaskGetPayload<{ include: { assets: true } }>;
interface Task extends ImageProcessingTask<ImageGenerationProviderId> {
  row: Row;
}

/** Existing Prisma/S3/BullMQ composition; the business processor has no such imports. */
export async function processImageGenerationJob(
  job: Job<ImageGenerationJobData>,
  token?: string,
): Promise<void> {
  if (job.data.type !== "run-task") return;
  await processImageGenerationTask<ImageGenerationProviderId, Task>(
    job.data.taskId,
    {
      async load(id) {
        const row = await db.imageGenerationTask.findUnique({
          where: { id },
          include: { assets: true },
        });
        if (!row) return null;
        // Turning off admission pauses unsubmitted work; accepted provider jobs can still finish.
        if (
          row.status === "QUEUED" &&
          !row.startedAt &&
          !row.providerTaskId &&
          !(await isFeatureEnabled("image-generation"))
        ) {
          await job.moveToDelayed(Date.now() + 60_000, token);
          throw new DelayedError();
        }
        return {
          id: row.id,
          userId: row.userId,
          status: PRISMA_TO_STATUS[row.status],
          providerTaskId: row.providerTaskId ?? undefined,
          providerTaskUrl: row.providerTaskUrl ?? undefined,
          input: imageGenerationEstimateInputSchema.parse({
            ...(row.request as Record<string, unknown>),
            provider: PRISMA_TO_PROVIDER[row.provider],
            model: row.model,
            operation: PRISMA_TO_OPERATION[row.operation],
            prompt: row.prompt,
          }),
          row,
        };
      },
      provider: getImageGenerationProvider,
      async claimSubmission(task) {
        const claimed = await db.imageGenerationTask.updateMany({
          where: {
            id: task.id,
            status: "QUEUED",
            providerTaskId: null,
            startedAt: null,
          },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            errorMessage: null,
          },
        });
        return claimed.count === 1;
      },
      async saveSubmission(task, prediction) {
        const saved = await db.imageGenerationTask.updateMany({
          where: { id: task.id, status: "RUNNING", providerTaskId: null },
          data: {
            providerTaskId: prediction.providerTaskId,
            providerTaskUrl: prediction.providerTaskUrl,
            providerRaw: toJson(prediction.providerRaw),
          },
        });
        if (saved.count !== 1)
          throw new Error("Image submission evidence could not be attached");
      },
      async markSubmissionUnknown(task) {
        await db.imageGenerationTask.updateMany({
          where: { id: task.id, providerTaskId: null, status: "RUNNING" },
          data: {
            errorMessage:
              "Submission outcome is unknown. Reconcile the existing provider request before creating another task.",
          },
        });
      },
      async observe(task, prediction) {
        await db.imageGenerationTask.updateMany({
          where: { id: task.id, status: "RUNNING" },
          data: {
            providerRaw: toJson(prediction.providerRaw),
            providerTaskUrl: prediction.providerTaskUrl,
          },
        });
      },
      async storeOutputs(record, completedPrediction) {
        const task = record.row;
        const providerInput = record.input;
        const providerId = providerInput.provider;
        const savedAssetIds: string[] = [];
        const outputs = completedPrediction.outputs;

        for (const [index, sourceUrl] of outputs.entries()) {
          const assetId = `img_${createHash("sha256").update(`${task.id}:${index}`).digest("hex")}`;
          const existing = await db.imageGenerationAsset.findFirst({
            where: { taskId: task.id, OR: [{ id: assetId }, { sourceUrl }] },
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
                id: `source_${assetId}`,
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
                id: assetId,
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

        return savedAssetIds;
      },
      async complete(task, prediction, assetIds) {
        const changed = await db.imageGenerationTask.updateMany({
          where: {
            id: task.id,
            status: "RUNNING",
            providerTaskId: prediction.providerTaskId,
          },
          data: {
            status: "SUCCEEDED",
            completedAt: new Date(),
            providerRaw: toJson(prediction.providerRaw),
            errorMessage: null,
          },
        });
        if (changed.count)
          await appEvents.emit("image_generation:succeeded", {
            taskId: task.id,
            userId: task.userId,
            provider: task.input.provider,
            model: task.input.model,
            assetIds,
          });
      },
      async fail(task, prediction) {
        await markFailed({
          taskId: task.id,
          userId: task.userId,
          provider: task.input.provider,
          model: task.input.model,
          status:
            prediction.status === "succeeded" ? "failed" : prediction.status,
          errorMessage: prediction.error ?? "Image generation failed",
          providerRaw: prediction.providerRaw,
        });
      },
      progress: (value) => job.updateProgress(value),
      logger,
    },
  );
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

  const changed = await db.imageGenerationTask.updateMany({
    where: { id: params.taskId, status: "RUNNING" },
    data: {
      status: STATUS_TO_PRISMA[failureStatus],
      completedAt: new Date(),
      errorMessage: params.errorMessage,
      providerRaw: toJson(params.providerRaw),
    },
  });

  if (!changed.count) return;
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
