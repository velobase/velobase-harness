import type { Prisma } from "@prisma/client";
import {
  ImageGenerationService as Service,
  assertSameImageRequest,
  type ImageGenerationRecord,
  type ImageGenerationRepository,
} from "@velobase/image-generation";
import { requireFeature } from "@/server/features/state";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { enqueueImageGenerationTask } from "@/workers/queues";
import {
  imageGenerationCreateInputSchema,
  imageGenerationEstimateInputSchema,
} from "./validators";
import { getImageGenerationProvider } from "./providers/registry";
import type {
  ImageGenerationAsset,
  ImageGenerationProviderId,
  ImageGenerationTask,
} from "./types";
import {
  OPERATION_TO_PRISMA,
  PRISMA_TO_OPERATION,
  PRISMA_TO_PROVIDER,
  PRISMA_TO_STATUS,
  PROVIDER_TO_PRISMA,
} from "./types";

const logger = createLogger("image-generation-service");
type TaskWithAssets = Prisma.ImageGenerationTaskGetPayload<{
  include: { assets: true };
}>;

const repository: ImageGenerationRepository<ImageGenerationProviderId> = {
  async get(id) {
    const task = await db.imageGenerationTask.findUnique({
      where: { id },
      include: { assets: true },
    });
    return task ? mapRecord(task) : null;
  },
  async findRequest(idempotencyKey) {
    const task = await db.imageGenerationTask.findUnique({
      where: { idempotencyKey },
      include: { assets: true },
    });
    return task ? mapRecord(task) : null;
  },
  async admit(input, costUsd) {
    return db.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`image-request:${input.idempotencyKey}`}))`;
        const existing = await tx.imageGenerationTask.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { assets: true },
        });
        if (existing) {
          const record = mapRecord(existing);
          assertSameImageRequest(record.input, input);
          return record;
        }
      }
      const task = await tx.imageGenerationTask.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          provider: PROVIDER_TO_PRISMA[input.provider],
          model: input.model,
          operation: OPERATION_TO_PRISMA[input.operation],
          status: "QUEUED",
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          request: toJson({
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
          }),
          providerOptions: input.providerOptions
            ? toJson(input.providerOptions)
            : undefined,
          idempotencyKey: input.idempotencyKey,
          costUsd,
          metadata: input.metadata ? toJson(input.metadata) : undefined,
        },
        include: { assets: true },
      });
      logger.info(
        { taskId: task.id, provider: input.provider, model: input.model },
        "Image generation task admitted",
      );
      return mapRecord(task);
    });
  },
};

/** Existing-table/queue composition of the independent business service. */
export class ImageGenerationService extends Service<ImageGenerationProviderId> {
  constructor() {
    super({
      repository,
      parseCreateInput: (input) =>
        imageGenerationCreateInputSchema.parse(input),
      parseEstimateInput: (input) =>
        imageGenerationEstimateInputSchema.parse(input),
      assertEnabled: async () => {
        await requireFeature("image-generation");
      },
      async assertProjectAccess(userId, projectId) {
        if (!projectId) return;
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { userId: true },
        });
        if (project?.userId !== userId)
          throw new Error("Project access denied");
      },
      provider: getImageGenerationProvider,
      enqueue: enqueueImageGenerationTask,
      logger,
    });
  }
}
export const imageGeneration = new ImageGenerationService();

function mapRecord(
  task: TaskWithAssets,
): ImageGenerationRecord<ImageGenerationProviderId> {
  return {
    task: mapTask(task),
    input: imageGenerationCreateInputSchema.parse({
      ...(task.request as Record<string, unknown>),
      provider: PRISMA_TO_PROVIDER[task.provider],
      model: task.model,
      operation: PRISMA_TO_OPERATION[task.operation],
      prompt: task.prompt,
      negativePrompt: task.negativePrompt ?? undefined,
      userId: task.userId,
      projectId: task.projectId ?? undefined,
      idempotencyKey: task.idempotencyKey ?? undefined,
      metadata: task.metadata ?? undefined,
    }),
  };
}

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
