import type {
  ImageGenerationEstimateInput,
  ImageGenerationStatus,
} from "./types";
import { TERMINAL_IMAGE_GENERATION_STATUSES } from "./types";
import type {
  ImageGenerationProviderAdapter,
  ProviderPrediction,
} from "./providers";

export interface ImageProcessingTask<P extends string = string> {
  id: string;
  userId: string;
  status: ImageGenerationStatus;
  input: ImageGenerationEstimateInput<P>;
  providerTaskId?: string;
  providerTaskUrl?: string;
}

export interface ImageProcessingPorts<
  P extends string = string,
  T extends ImageProcessingTask<P> = ImageProcessingTask<P>,
> {
  load(id: string): Promise<T | null>;
  provider(id: P): ImageGenerationProviderAdapter<P>;
  /** Atomic QUEUED -> submitted marker, persisted before external I/O. Never reset automatically. */
  claimSubmission(task: T): Promise<boolean>;
  saveSubmission(task: T, prediction: ProviderPrediction<P>): Promise<void>;
  markSubmissionUnknown(task: T): Promise<void>;
  /** Save observations, but keep the local task running until assets or failure commit. */
  observe(task: T, prediction: ProviderPrediction<P>): Promise<void>;
  /** Import outputs idempotently using (task id, output index); must not generate another image. */
  storeOutputs(task: T, prediction: ProviderPrediction<P>): Promise<string[]>;
  complete(
    task: T,
    prediction: ProviderPrediction<P>,
    assetIds: string[],
  ): Promise<void>;
  fail(task: T, prediction: ProviderPrediction<P>): Promise<void>;
  progress?(percent: number): Promise<void>;
  logger?: { warn(data: Record<string, unknown>, message: string): void };
  pollTimeoutMs?: number;
}

/** Accepted-job execution; it deliberately does not reopen new-work admission. */
export async function processImageGenerationTask<
  P extends string,
  T extends ImageProcessingTask<P>,
>(id: string, ports: ImageProcessingPorts<P, T>): Promise<void> {
  const timeoutMs = ports.pollTimeoutMs ?? 300_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 3_600_000)
    throw new Error("Invalid image processing poll duration");
  const task = await ports.load(id);
  if (!task || TERMINAL_IMAGE_GENERATION_STATUSES.has(task.status)) return;
  const provider = ports.provider(task.input.provider);
  if (provider.id !== task.input.provider)
    throw new Error("Wrong image provider selected for task");
  let prediction: ProviderPrediction<P>;
  if (task.providerTaskId) {
    prediction = await provider.getPrediction(
      task.providerTaskId,
      task.providerTaskUrl,
    );
    assertPrediction(prediction, task.input.provider, task.providerTaskId);
  } else {
    if (!(await ports.claimSubmission(task))) {
      ports.logger?.warn(
        { taskId: task.id },
        "Image submission was already claimed; provider evidence is required, no resubmission",
      );
      return;
    }
    try {
      prediction = await provider.createPrediction(task.input);
      assertPrediction(prediction, task.input.provider);
      await ports.saveSubmission(task, prediction);
    } catch (error) {
      await ports.markSubmissionUnknown(task);
      throw error;
    }
  }
  await ports.progress?.(20);
  const deadline = Date.now() + timeoutMs;
  let interval = 2_000;
  let taskUrl = prediction.providerTaskUrl ?? task.providerTaskUrl;
  while (!TERMINAL_IMAGE_GENERATION_STATUSES.has(prediction.status)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(
        "Image provider is still pending; resume polling the existing task",
      );
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(interval, remaining)),
    );
    const next = await provider.getPrediction(
      prediction.providerTaskId,
      taskUrl,
    );
    assertPrediction(next, task.input.provider, prediction.providerTaskId);
    prediction = next;
    taskUrl = prediction.providerTaskUrl ?? taskUrl;
    await ports.observe(task, prediction);
    interval = Math.min(30_000, Math.ceil(interval * 1.5));
  }
  if (prediction.status !== "succeeded" || !prediction.outputs.length) {
    await ports.fail(
      task,
      prediction.status === "succeeded"
        ? {
            ...prediction,
            status: "failed",
            error: "Provider completed without image outputs",
          }
        : prediction,
    );
    return;
  }
  await ports.progress?.(70);
  const assetIds = await ports.storeOutputs(task, prediction);
  if (assetIds.length !== prediction.outputs.length)
    throw new Error("Image output import is incomplete");
  await ports.complete(task, prediction, assetIds);
  await ports.progress?.(100);
}

function assertPrediction(
  prediction: ProviderPrediction,
  provider: string,
  id?: string,
) {
  if (
    prediction.provider !== provider ||
    typeof prediction.providerTaskId !== "string" ||
    !prediction.providerTaskId ||
    (id && prediction.providerTaskId !== id)
  )
    throw new Error("Image provider returned mismatched task evidence");
}
