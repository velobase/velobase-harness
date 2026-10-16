import { env } from "@/env";
import type { ImageGenerationEstimateInput } from "../types";
import type {
  ImageGenerationProviderAdapter,
  ProviderCapabilities,
  ProviderImageGenerationInput,
  ProviderModel,
  ProviderPrediction,
} from "./types";
import { ImageGenerationProviderError } from "./types";

const ATLASCLOUD_PROVIDER_ID = "atlascloud" as const;
const DEFAULT_MODEL = "bytedance/seedream-v5.0-lite";

type AtlasCloudResponse<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type AtlasCloudPredictionData = {
  id?: string;
  model?: string;
  status?: string;
  outputs?: unknown[];
  error?: string;
  created_at?: string;
  timings?: Record<string, unknown>;
};

export class AtlasCloudProvider implements ImageGenerationProviderAdapter {
  readonly id = ATLASCLOUD_PROVIDER_ID;

  constructor(
    private readonly config = {
      apiKey: env.ATLASCLOUD_API_KEY,
      baseUrl: env.ATLASCLOUD_BASE_URL,
      timeoutMs: env.ATLASCLOUD_REQUEST_TIMEOUT_MS,
    },
  ) {}

  async createPrediction(
    input: ProviderImageGenerationInput,
  ): Promise<ProviderPrediction> {
    this.assertSupportedInput(input);

    // Generation POSTs are intentionally attempted once. A network failure can
    // be ambiguous, so retrying here could create a second billable task.
    const response = await this.request<AtlasCloudPredictionData>(
      "/api/v1/model/generateImage",
      {
        method: "POST",
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          size: resolveAtlasCloudSize(input.aspectRatio, input.resolution),
          output_format: input.outputFormat ?? "png",
          enable_base64_output: false,
        }),
      },
    );

    return this.toPrediction(response.data, input.model, response);
  }

  async getPrediction(providerTaskId: string): Promise<ProviderPrediction> {
    const response = await this.request<AtlasCloudPredictionData>(
      `/api/v1/model/prediction/${encodeURIComponent(providerTaskId)}`,
      { method: "GET" },
    );

    return this.toPrediction(response.data, undefined, response);
  }

  async estimateCost(
    _input: ImageGenerationEstimateInput,
  ): Promise<number | undefined> {
    return undefined;
  }

  async listModels(): Promise<ProviderModel[]> {
    return [
      {
        id: DEFAULT_MODEL,
        name: "Seedream 5.0 Lite",
        type: "text-to-image",
        description: "Default Atlas Cloud text-to-image model.",
      },
    ];
  }

  getCapabilities(): ProviderCapabilities {
    return {
      provider: this.id,
      operations: ["text-to-image"],
      outputFormats: ["png", "jpeg"],
      qualities: ["low", "medium", "high"],
      resolutions: ["1k", "2k", "4k"],
      supportsProviderOptions: false,
      supportsPricing: false,
      supportsModelListing: false,
    };
  }

  private assertSupportedInput(input: ProviderImageGenerationInput): void {
    if (input.operation !== "text-to-image" || input.imageUrls?.length) {
      throw this.unsupported(
        "Atlas Cloud currently supports text-to-image only",
      );
    }
    if (input.negativePrompt) {
      throw this.unsupported("Atlas Cloud does not support negativePrompt");
    }
    if (input.outputFormat === "webp") {
      throw this.unsupported("Atlas Cloud supports png and jpeg output only");
    }
    if (
      input.providerOptions &&
      Object.keys(input.providerOptions).length > 0
    ) {
      throw this.unsupported("Atlas Cloud does not accept providerOptions");
    }
  }

  private unsupported(message: string): ImageGenerationProviderError {
    return new ImageGenerationProviderError(message, {
      provider: this.id,
      retryable: false,
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<AtlasCloudResponse<T>> {
    if (!this.config.apiKey) {
      throw new ImageGenerationProviderError(
        "Atlas Cloud API key is not configured",
        { provider: this.id, retryable: false },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(
        `${this.config.baseUrl.replace(/\/$/, "")}${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
          signal: controller.signal,
        },
      );
      const rawText = await response.text();
      const json = parseJson<AtlasCloudResponse<T>>(rawText);

      if (!response.ok || (json?.code != null && json.code !== 200)) {
        const status = response.status;
        throw new ImageGenerationProviderError(
          json?.message ??
            rawText.trim() ??
            `Atlas Cloud request failed with ${status}`,
          {
            provider: this.id,
            httpStatus: status,
            code: json?.code,
            retryable: isRetryableStatus(status),
            providerRaw: json ?? rawText,
          },
        );
      }

      return json ?? ({ data: undefined } as AtlasCloudResponse<T>);
    } catch (error) {
      if (error instanceof ImageGenerationProviderError) throw error;
      throw new ImageGenerationProviderError("Atlas Cloud request failed", {
        provider: this.id,
        retryable: true,
        providerRaw: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private toPrediction(
    data: AtlasCloudPredictionData | undefined,
    fallbackModel: string | undefined,
    providerRaw: unknown,
  ): ProviderPrediction {
    if (!data?.id) {
      throw new ImageGenerationProviderError(
        "Atlas Cloud response did not include a prediction id",
        { provider: this.id, retryable: false, providerRaw },
      );
    }

    return {
      provider: this.id,
      providerTaskId: data.id,
      model: data.model ?? fallbackModel ?? "",
      status: mapAtlasCloudStatus(data.status),
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

export function resolveAtlasCloudSize(
  aspectRatio = "1:1",
  resolution: "1k" | "2k" | "4k" = "2k",
): string {
  const sizes = resolution === "4k" ? FOUR_K_SIZES : TWO_K_SIZES;
  return sizes[aspectRatio] ?? sizes["1:1"]!;
}

const TWO_K_SIZES: Record<string, string> = {
  "1:1": "2048*2048",
  "4:3": "2304*1728",
  "3:4": "1728*2304",
  "16:9": "2848*1600",
  "9:16": "1600*2848",
  "3:2": "2496*1664",
  "2:3": "1664*2496",
  "21:9": "3136*1344",
};

const FOUR_K_SIZES: Record<string, string> = {
  "1:1": "3072*3072",
  "4:3": "3456*2592",
  "3:4": "2592*3456",
  "16:9": "4096*2304",
  "9:16": "2304*4096",
  "3:2": "3744*2496",
  "2:3": "2496*3744",
  "21:9": "4704*2016",
};

function mapAtlasCloudStatus(status: string | undefined) {
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

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
