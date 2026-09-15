import type {
  ImageGenerationEstimateInput,
  ImageGenerationStatus,
} from "@velobase/image-generation/types";
import type {
  ImageGenerationProviderAdapter as Adapter,
  ProviderCapabilities as Capabilities,
  ProviderImageGenerationInput,
  ProviderModel,
  ProviderPrediction as Prediction,
} from "@velobase/image-generation/providers";
import { ImageGenerationProviderError } from "@velobase/image-generation/providers";

type ImageGenerationProviderAdapter = Adapter<"modelrunner">;
type ProviderCapabilities = Capabilities<"modelrunner">;
type ProviderPrediction = Prediction<"modelrunner">;
export interface ModelrunnerConfiguration {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  queueUrl: string;
  logger?: { warn(data: Record<string, unknown>, message: string): void };
}

const MODELRUNNER_PROVIDER_ID = "modelrunner" as const;
const MAX_ATTEMPTS = 3;
const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 10;

/**
 * Queue submit response. Every `*_url` is absolute, so the result URL is carried
 * on the prediction rather than rebuilt from the task id: the queue paths are
 * scoped by model endpoint, which `getPrediction` is not given.
 */
type ModelRunnerSubmitResponse = {
  status?: string;
  request_id?: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
  queue_position?: number;
  error?: string;
};

/** Result response. `output` is shaped by the model, not by the platform. */
type ModelRunnerResultResponse = {
  status?: string;
  request_id?: string;
  output?: unknown;
  error?: string;
  metrics?: { inference_time?: number };
};

type ModelRunnerCatalogModel = {
  ownerName?: string;
  alias?: string;
  name?: string;
  shortDescription?: string | null;
  description?: string | null;
  category?: string;
  outputModalities?: string[];
  pricingMode?: string;
  pricePerOutput?: number | string;
};

type ModelRunnerCatalogResponse = {
  data?: ModelRunnerCatalogModel[];
  totalPages?: number;
};

export class ModelrunnerProvider implements ImageGenerationProviderAdapter {
  readonly id = MODELRUNNER_PROVIDER_ID;

  constructor(private readonly config: ModelrunnerConfiguration) {
    if (
      !config.apiKey.trim() ||
      !Number.isFinite(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      config.timeoutMs > 300_000
    ) {
      throw new Error("Invalid Modelrunner connection configuration");
    }
    for (const value of [config.baseUrl, config.queueUrl]) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "Modelrunner API URLs must use HTTPS without credentials, query or fragment",
        );
      }
    }
  }

  async createPrediction(
    input: ProviderImageGenerationInput,
  ): Promise<ProviderPrediction> {
    assertModelId(input.model, this.id);

    const submitted = await this.request<ModelRunnerSubmitResponse>(
      `${this.config.queueUrl}/${input.model}`,
      { method: "POST", body: JSON.stringify(this.toModelRunnerInput(input)) },
    );

    if (!submitted.request_id) {
      throw new ImageGenerationProviderError(
        "ModelRunner submit returned no request_id",
        { provider: this.id, retryable: false, providerRaw: submitted },
      );
    }

    return {
      provider: this.id,
      providerTaskId: submitted.request_id,
      providerTaskUrl:
        submitted.response_url ??
        `${this.config.queueUrl}/${input.model}/requests/${submitted.request_id}`,
      model: input.model,
      status: mapModelRunnerStatus(submitted.status),
      outputs: [],
      error: submitted.error,
      providerRaw: submitted,
    };
  }

  async getPrediction(
    providerTaskId: string,
    providerTaskUrl?: string,
  ): Promise<ProviderPrediction> {
    if (!providerTaskUrl) {
      // The queue is addressed as /{owner}/{alias}/requests/{id}, so the model
      // endpoint is required and a bare task id cannot be resolved.
      throw new ImageGenerationProviderError(
        "ModelRunner requires the task URL recorded at submit time",
        { provider: this.id, retryable: false },
      );
    }

    const url = this.assertOwnQueueUrl(providerTaskUrl);
    const result = await this.request<ModelRunnerResultResponse>(url, {
      method: "GET",
    });
    if (result.request_id && result.request_id !== providerTaskId) {
      throw new ImageGenerationProviderError(
        "ModelRunner returned a different request id",
        { provider: this.id, retryable: false },
      );
    }

    return {
      provider: this.id,
      providerTaskId,
      providerTaskUrl,
      model: "",
      status: mapModelRunnerStatus(result.status),
      outputs: extractOutputs(result.output),
      error: result.error,
      providerRaw: result,
      timings: result.metrics,
    };
  }

  /**
   * Cost estimate from the published catalog price.
   *
   * Only flat per-output models are quoted. Megapixel, tiered and per-token
   * models are priced from the finished request, so any single number here would
   * be a guess; the contract allows `undefined`, and the service treats it as
   * "unknown" rather than "free".
   */
  async estimateCost(
    input: ImageGenerationEstimateInput,
  ): Promise<number | undefined> {
    const model = await this.findCatalogModel(input.model);
    if (!model) return undefined;

    if (model.pricingMode !== "per_output") return undefined;

    const price = Number(model.pricePerOutput ?? 0);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  async listModels(): Promise<ProviderModel[]> {
    const models: ProviderModel[] = [];

    for await (const model of this.iterateCatalog()) {
      if (!model.ownerName || !model.alias) continue;
      if (!(model.outputModalities ?? []).includes("image")) continue;

      const endpoint = `${model.ownerName}/${model.alias}`;
      const price = Number(model.pricePerOutput ?? 0);

      models.push({
        id: endpoint,
        name: model.name ?? endpoint,
        type: model.category,
        basePriceUsd:
          model.pricingMode === "per_output" && price > 0 ? price : undefined,
        description: model.shortDescription ?? model.description ?? undefined,
        providerRaw: model,
      });
    }

    return models;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      provider: this.id,
      operations: ["text-to-image", "image-to-image", "edit-image"],
      outputFormats: ["png", "jpeg", "webp"],
      qualities: ["low", "medium", "high"],
      resolutions: ["1k", "2k", "4k"],
      supportsProviderOptions: true,
      supportsPricing: true,
      supportsModelListing: true,
    };
  }

  /**
   * Build the request body.
   *
   * Only widely-shared field names are mapped; anything model-specific belongs in
   * `providerOptions`, which is spread last so a caller can always override.
   */
  private toModelRunnerInput(
    input: ProviderImageGenerationInput | ImageGenerationEstimateInput,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = { prompt: input.prompt };

    if (input.negativePrompt) payload.negative_prompt = input.negativePrompt;
    if (input.aspectRatio) payload.aspect_ratio = input.aspectRatio;
    if (input.outputFormat) payload.output_format = input.outputFormat;

    const imageUrls = input.imageUrls ?? [];
    if (imageUrls.length === 1) {
      payload.image_url = imageUrls[0];
    } else if (imageUrls.length > 1) {
      payload.image_urls = imageUrls;
    }

    return { ...payload, ...(input.providerOptions ?? {}) };
  }

  private async findCatalogModel(
    modelId: string,
  ): Promise<ModelRunnerCatalogModel | undefined> {
    for await (const model of this.iterateCatalog()) {
      if (`${model.ownerName}/${model.alias}` === modelId) return model;
    }
    return undefined;
  }

  /** Walk the public catalog page by page. */
  private async *iterateCatalog(): AsyncGenerator<ModelRunnerCatalogModel> {
    for (let page = 1; page <= CATALOG_MAX_PAGES; page += 1) {
      const response = await this.request<ModelRunnerCatalogResponse>(
        `${this.config.baseUrl}/models?limit=${CATALOG_PAGE_SIZE}&page=${page}`,
        { method: "GET" },
      );

      const models = response.data ?? [];
      if (models.length === 0) return;
      for (const model of models) yield model;

      if (page >= (response.totalPages ?? 1)) return;
    }
  }

  /**
   * Guard the task URL carried across a job boundary. It originates from the
   * provider response, so it is only followed when it points at our own queue.
   */
  private assertOwnQueueUrl(candidate: string): string {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new ImageGenerationProviderError(
        "ModelRunner task URL is invalid",
        {
          provider: this.id,
          retryable: false,
        },
      );
    }

    const expected = new URL(this.config.queueUrl);
    if (
      parsed.origin !== expected.origin ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new ImageGenerationProviderError(
        `ModelRunner task URL is not on the queue host: ${parsed.host}`,
        { provider: this.id, retryable: false },
      );
    }

    return parsed.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    if (!this.config.apiKey) {
      throw new ImageGenerationProviderError(
        "ModelRunner API key is not configured",
        { provider: this.id, retryable: false },
      );
    }

    // A lost POST response does not establish that no job was created.
    const maxAttempts =
      (init.method ?? "GET").toUpperCase() === "GET" ? MAX_ATTEMPTS : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );

      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Authorization: `Key ${this.config.apiKey}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
          signal: controller.signal,
          redirect: "error",
        });

        const rawText = await response.text();
        const json = parseJson<T & { error?: string; message?: string }>(
          rawText,
        );

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);
          if (retryable && attempt < maxAttempts) {
            await wait(backoffDelay(attempt));
            continue;
          }

          throw new ImageGenerationProviderError(
            json?.error ??
              json?.message ??
              `ModelRunner request failed with ${response.status}`,
            {
              provider: this.id,
              httpStatus: response.status,
              retryable,
              providerRaw: json ?? rawText,
            },
          );
        }

        if (!json) {
          throw new ImageGenerationProviderError(
            "ModelRunner returned a non-JSON response",
            { provider: this.id, retryable: false, providerRaw: rawText },
          );
        }

        return json;
      } catch (error) {
        lastError = error;

        if (error instanceof ImageGenerationProviderError) throw error;

        if (attempt < maxAttempts) {
          await wait(backoffDelay(attempt));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    this.config.logger?.warn(
      { provider: this.id },
      "ModelRunner request failed",
    );
    throw new ImageGenerationProviderError("ModelRunner request failed", {
      provider: MODELRUNNER_PROVIDER_ID,
      retryable: true,
      providerRaw: lastError,
    });
  }
}

/** Model ids are `owner/alias` and go into the URL path unescaped. */
function assertModelId(model: string, provider: "modelrunner"): void {
  if (!/^[A-Za-z0-9][\w.-]*\/[\w./-]+$/.test(model) || model.includes("..")) {
    throw new ImageGenerationProviderError(
      `ModelRunner model id is invalid: ${model}`,
      { provider, retryable: false },
    );
  }
}

function mapModelRunnerStatus(
  status: string | undefined,
): ImageGenerationStatus {
  switch ((status ?? "").trim().toUpperCase()) {
    case "IN_QUEUE":
      return "queued";
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "canceled";
    default:
      return "running";
  }
}

/**
 * Collect output URLs. The shape belongs to the model: most image models return
 * a bare URL string, others an object or a list of either.
 */
function extractOutputs(output: unknown): string[] {
  if (typeof output === "string") return output ? [output] : [];

  if (Array.isArray(output)) {
    return output.flatMap((item) => extractOutputs(item));
  }

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    for (const key of ["image_url", "url", "image", "images", "output"]) {
      if (key in record) {
        const found = extractOutputs(record[key]);
        if (found.length > 0) return found;
      }
    }
  }

  return [];
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function backoffDelay(attempt: number): number {
  return Math.min(2000, 250 * 2 ** (attempt - 1));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
