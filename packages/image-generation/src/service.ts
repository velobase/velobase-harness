import type {
  ImageGenerationAsset,
  ImageGenerationCreateInput,
  ImageGenerationEstimateInput,
  ImageGenerationTask,
} from "./types";
import { TERMINAL_IMAGE_GENERATION_STATUSES } from "./types";
import type { ImageGenerationProviderAdapter } from "./providers";

export interface ImageGenerationRecord<P extends string = string> {
  input: ImageGenerationCreateInput<P>;
  task: ImageGenerationTask<P>;
}

export interface ImageGenerationRepository<P extends string = string> {
  get(id: string): Promise<ImageGenerationRecord<P> | null>;
  findRequest(key: string): Promise<ImageGenerationRecord<P> | null>;
  /** Atomically reuse an identical request or insert a new task. Never replace its snapshot. */
  admit(
    input: ImageGenerationCreateInput<P>,
    costUsd?: number,
  ): Promise<ImageGenerationRecord<P>>;
}

export interface ImageGenerationOptions<P extends string = string> {
  repository: ImageGenerationRepository<P>;
  parseCreateInput(input: unknown): ImageGenerationCreateInput<P>;
  parseEstimateInput(input: unknown): ImageGenerationEstimateInput<P>;
  assertEnabled(): Promise<void>;
  assertProjectAccess(userId: string, projectId?: string): Promise<void>;
  provider(id: P): ImageGenerationProviderAdapter<P>;
  /** Wake processing for this persisted task id; retries must use that same id. */
  enqueue(id: string): Promise<void>;
  logger?: { warn(data: Record<string, unknown>, message: string): void };
}

export class ImageGenerationWaitTimeoutError extends Error {
  constructor(readonly taskId: string) {
    super("Image generation is still pending; read the existing task again");
    this.name = "ImageGenerationWaitTimeoutError";
  }
}

/** Business orchestration; no database, queue, model SDK, env or UI imports. */
export class ImageGenerationService<P extends string = string> {
  constructor(private readonly options: ImageGenerationOptions<P>) {}

  async estimateCost(
    raw: ImageGenerationEstimateInput<P>,
  ): Promise<number | undefined> {
    const input = this.options.parseEstimateInput(raw);
    try {
      const value = await this.options.provider(input.provider).estimateCost(input);
      return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
    } catch {
      this.options.logger?.warn(
        { provider: input.provider, model: input.model },
        "Image generation cost estimate unavailable",
      );
      return undefined;
    }
  }

  async createTask(
    raw: ImageGenerationCreateInput<P>,
  ): Promise<ImageGenerationTask<P>> {
    const input = this.options.parseCreateInput(raw);
    await this.options.assertProjectAccess(input.userId, input.projectId);
    if (input.idempotencyKey) {
      const existing = await this.options.repository.findRequest(
        input.idempotencyKey,
      );
      if (existing) {
        assertSameImageRequest(existing.input, input);
        // An accepted job remains recoverable while admission of new work is off.
        if (!TERMINAL_IMAGE_GENERATION_STATUSES.has(existing.task.status))
          await this.options.enqueue(existing.task.id);
        return existing.task;
      }
    }
    await this.options.assertEnabled();
    const provider = this.options.provider(input.provider);
    if (
      provider.id !== input.provider ||
      !provider.getCapabilities().operations.includes(input.operation)
    ) {
      throw new Error(
        "Selected image provider does not support this operation",
      );
    }
    const costUsd = await this.estimateCost(input);
    await this.options.assertEnabled();
    const record = await this.options.repository.admit(input, costUsd);
    assertSameImageRequest(record.input, input);
    if (!TERMINAL_IMAGE_GENERATION_STATUSES.has(record.task.status))
      await this.options.enqueue(record.task.id);
    return record.task;
  }

  async getTask(
    id: string,
    options: { userId?: string } = {},
  ): Promise<ImageGenerationTask<P> | null> {
    const record = await this.options.repository.get(id);
    if (!record) return null;
    if (options.userId && record.input.userId !== options.userId)
      throw new Error("Image generation task access denied");
    return record.task;
  }

  async waitForTask(
    id: string,
    options: {
      userId?: string;
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {},
  ): Promise<ImageGenerationTask<P>> {
    const timeoutMs = options.timeoutMs ?? 300_000;
    const interval = options.pollIntervalMs ?? 2_000;
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      !Number.isFinite(interval) ||
      interval <= 0
    )
      throw new Error("Invalid image generation wait duration");
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const task = await this.getTask(id, options);
      if (!task) throw new Error("Image generation task not found");
      if (TERMINAL_IMAGE_GENERATION_STATUSES.has(task.status)) return task;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ImageGenerationWaitTimeoutError(id);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(interval, remaining)),
      );
    }
  }

  async generateImage(
    input: ImageGenerationCreateInput<P>,
    options: { timeoutMs?: number } = {},
  ): Promise<ImageGenerationAsset<P>> {
    const task = await this.createTask(input);
    const finished = await this.waitForTask(task.id, {
      userId: input.userId,
      timeoutMs: options.timeoutMs,
    });
    if (finished.status !== "succeeded")
      throw new Error(
        finished.errorMessage ?? "Image generation task did not succeed",
      );
    const asset = finished.assets.find((value) => value.status === "succeeded");
    if (!asset)
      throw new Error("Image generation task succeeded without an asset");
    return asset;
  }

  async listModels(provider: P) {
    return (await this.options.provider(provider).listModels()).filter(
      (model) => model.type?.includes("image"),
    );
  }

  getCapabilities(provider: P) {
    return this.options.provider(provider).getCapabilities();
  }
}

/** Used inside repository admission as well as before an idempotent replay. */
export function assertSameImageRequest(
  existing: ImageGenerationCreateInput,
  requested: ImageGenerationCreateInput,
): void {
  if (requestIdentity(existing) !== requestIdentity(requested))
    throw new Error(
      "Image generation request id is already used for a different request",
    );
}

function requestIdentity(input: ImageGenerationCreateInput): string {
  // JSON round-trip matches persisted JSON semantics (undefined fields are omitted).
  const normalized = JSON.parse(JSON.stringify(input)) as unknown;
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, ordered(item)]),
      );
    return value;
  }
  return JSON.stringify(ordered(normalized));
}
