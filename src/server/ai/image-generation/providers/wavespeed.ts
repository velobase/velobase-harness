import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import type { ImageGenerationEstimateInput } from "../types";
import type {
  ImageGenerationProviderAdapter,
  ProviderCapabilities,
  ProviderImageGenerationInput,
  ProviderModel,
  ProviderPrediction,
} from "./types";
import { ImageGenerationProviderError } from "./types";

const logger = createLogger("wavespeed-provider");

const WAVESPEED_PROVIDER_ID = "wavespeed" as const;
const MAX_ATTEMPTS = 3;

type WaveSpeedResponse<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type WaveSpeedPredictionData = {
  id?: string;
  model?: string;
  status?: string;
  outputs?: unknown[];
  urls?: {
    get?: string;
  };
  error?: string;
  created_at?: string;
  timings?: Record<string, unknown>;
};

type WaveSpeedPricingData = {
  model_id?: string;
  unit_price?: number;
  currency?: string;
};

type WaveSpeedModelData = {
  model_id?: string;
  name?: string;
  type?: string;
  base_price?: number;
  description?: string;
};

export class WavespeedProvider implements ImageGenerationProviderAdapter {
  readonly id = WAVESPEED_PROVIDER_ID;

  constructor(
    private readonly config = {
      apiKey: env.WAVESPEED_API_KEY,
      baseUrl: env.WAVESPEED_BASE_URL,
      timeoutMs: env.WAVESPEED_REQUEST_TIMEOUT_MS,
    },
  ) {}

  async createPrediction(
    input: ProviderImageGenerationInput,
  ): Promise<ProviderPrediction> {
    const response = await this.request<WaveSpeedPredictionData>(
      `/api/v3/${input.model}`,
      {
        method: "POST",
        body: JSON.stringify(this.toWaveSpeedInput(input)),
      },
    );

    return this.toPrediction(response.data, input.model, response);
  }

  async getPrediction(
    providerTaskId: string,
    providerTaskUrl?: string,
  ): Promise<ProviderPrediction> {
    const path = providerTaskUrl ?? `/api/v3/predictions/${providerTaskId}`;

    try {
      const response = await this.request<WaveSpeedPredictionData>(path, {
        method: "GET",
      });
      return this.toPrediction(response.data, undefined, response);
    } catch (error) {
      if (
        error instanceof ImageGenerationProviderError &&
        error.details.httpStatus === 404 &&
        !providerTaskUrl
      ) {
        const fallback = await this.request<WaveSpeedPredictionData>(
          `/api/v3/predictions/${providerTaskId}/result`,
          { method: "GET" },
        );
        return this.toPrediction(fallback.data, undefined, fallback);
      }

      throw error;
    }
  }

  async estimateCost(
    input: ImageGenerationEstimateInput,
  ): Promise<number | undefined> {
    const response = await this.request<WaveSpeedPricingData>(
      "/api/v3/model/pricing",
      {
        method: "POST",
        body: JSON.stringify({
          model_id: input.model,
          inputs: this.toWaveSpeedInput(input),
        }),
      },
    );

    const unitPrice = response.data?.unit_price;
    return typeof unitPrice === "number" ? unitPrice : undefined;
  }

  async listModels(): Promise<ProviderModel[]> {
    const response = await this.request<WaveSpeedModelData[]>(
      "/api/v3/models",
      {
        method: "GET",
      },
    );

    return (response.data ?? [])
      .filter((model) => typeof model.model_id === "string")
      .map((model) => ({
        id: model.model_id!,
        name: model.name ?? model.model_id!,
        type: model.type,
        basePriceUsd:
          typeof model.base_price === "number" ? model.base_price : undefined,
        description: model.description,
        providerRaw: model,
      }));
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

  private toWaveSpeedInput(
    input: ProviderImageGenerationInput | ImageGenerationEstimateInput,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      enable_sync_mode: false,
      enable_base64_output: false,
      ...input.providerOptions,
      prompt: input.prompt,
    };

    if (input.negativePrompt) payload.negative_prompt = input.negativePrompt;
    if (input.aspectRatio) payload.aspect_ratio = input.aspectRatio;
    if (input.quality) payload.quality = input.quality;
    if (input.resolution) payload.resolution = input.resolution;
    if (input.outputFormat) payload.output_format = input.outputFormat;
    if (input.imageUrls?.length) {
      payload.image = input.imageUrls[0];
      payload.images = input.imageUrls;
    }

    return payload;
  }

  private async request<T>(
    pathOrUrl: string,
    init: RequestInit,
  ): Promise<WaveSpeedResponse<T>> {
    if (!this.config.apiKey) {
      throw new ImageGenerationProviderError(
        "WaveSpeed API key is not configured",
        {
          provider: this.id,
          retryable: false,
        },
      );
    }

    const url = this.resolveUrl(pathOrUrl);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );

      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
          signal: controller.signal,
        });

        const rawText = await response.text();
        const json = parseJson<WaveSpeedResponse<T>>(rawText);

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);
          if (retryable && attempt < MAX_ATTEMPTS) {
            await wait(backoffDelay(attempt));
            continue;
          }

          throw new ImageGenerationProviderError(
            getProviderMessage(json, rawText) ??
              `WaveSpeed request failed with ${response.status}`,
            {
              provider: this.id,
              httpStatus: response.status,
              code: json?.code,
              retryable,
              providerRaw: json ?? rawText,
            },
          );
        }

        if (json?.code && json.code >= 400) {
          const retryable = isRetryableStatus(json.code);
          if (retryable && attempt < MAX_ATTEMPTS) {
            await wait(backoffDelay(attempt));
            continue;
          }

          throw new ImageGenerationProviderError(
            json.message ?? "WaveSpeed request failed",
            {
              provider: this.id,
              code: json.code,
              retryable,
              providerRaw: json,
            },
          );
        }

        return json ?? ({ data: undefined } as WaveSpeedResponse<T>);
      } catch (error) {
        lastError = error;
        if (error instanceof ImageGenerationProviderError) throw error;
        if (attempt < MAX_ATTEMPTS) {
          await wait(backoffDelay(attempt));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    logger.warn({ err: lastError, url }, "WaveSpeed request failed");
    throw new ImageGenerationProviderError("WaveSpeed request failed", {
      provider: this.id,
      retryable: true,
      providerRaw: lastError,
    });
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = this.config.baseUrl.replace(/\/$/, "");
    return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  private toPrediction(
    data: WaveSpeedPredictionData | undefined,
    fallbackModel: string | undefined,
    providerRaw: unknown,
  ): ProviderPrediction {
    if (!data?.id) {
      throw new ImageGenerationProviderError(
        "WaveSpeed response did not include a prediction id",
        {
          provider: this.id,
          retryable: false,
          providerRaw,
        },
      );
    }

    return {
      provider: this.id,
      providerTaskId: data.id,
      providerTaskUrl: data.urls?.get,
      model: data.model ?? fallbackModel ?? "",
      status: mapWaveSpeedStatus(data.status),
      outputs: (data.outputs ?? []).filter(
        (output): output is string => typeof output === "string",
      ),
      error: data.error || undefined,
      providerRaw,
      createdAt: data.created_at,
      timings: data.timings,
    };
  }
}

function mapWaveSpeedStatus(status: string | undefined) {
  switch ((status ?? "").trim().toLowerCase()) {
    case "created":
    case "queued":
      return "queued";
    case "processing":
    case "running":
      return "running";
    case "completed":
    case "succeeded":
    case "success":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "timed_out":
    case "timeout":
      return "timed_out";
    default:
      return "running";
  }
}

function parseJson<T>(text: string): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function getProviderMessage(
  json: WaveSpeedResponse<unknown> | undefined,
  rawText: string,
): string | undefined {
  if (typeof json?.message === "string" && json.message.trim()) {
    return json.message;
  }
  return rawText.trim() || undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function backoffDelay(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
