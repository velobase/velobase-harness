import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import {
  VelobaseGatewayError,
  type VelobaseGatewayBillingHeaders,
  type VelobaseGatewayChatTestInput,
  type VelobaseGatewayChatTestResult,
  type VelobaseGatewayKeyKind,
  type VelobaseGatewayModel,
  type VelobaseGatewayUsage,
} from "./types";

const logger = createLogger("velobase-gateway");

const DEFAULT_BASE_URL = "https://api.velobase.io/v1";
const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";

type VelobaseGatewayConfigOverrides = {
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  defaultModel?: string;
};

type VelobaseGatewayModelResponse = {
  data?: unknown[];
};

type VelobaseGatewayChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type ResolvedVelobaseGatewayConfig = {
  apiKey?: string;
  baseURL: string;
  timeoutMs: number;
  defaultModel: string;
  hasDedicatedGatewayKey: boolean;
  hasBillingKey: boolean;
  keyKind: VelobaseGatewayKeyKind;
};

export function getVelobaseGatewayConfig(
  overrides: VelobaseGatewayConfigOverrides = {},
): ResolvedVelobaseGatewayConfig {
  const apiKey =
    overrides.apiKey ?? env.VELOBASE_GATEWAY_API_KEY ?? env.VELOBASE_API_KEY;
  const baseURL = withoutTrailingSlash(
    overrides.baseURL ?? env.VELOBASE_GATEWAY_BASE_URL ?? DEFAULT_BASE_URL,
  );

  return {
    apiKey,
    baseURL,
    timeoutMs:
      overrides.timeoutMs ?? env.VELOBASE_GATEWAY_REQUEST_TIMEOUT_MS ?? 30000,
    defaultModel:
      overrides.defaultModel ??
      env.VELOBASE_GATEWAY_DEFAULT_MODEL ??
      DEFAULT_MODEL,
    hasDedicatedGatewayKey: Boolean(env.VELOBASE_GATEWAY_API_KEY),
    hasBillingKey: Boolean(env.VELOBASE_API_KEY),
    keyKind: getKeyKind(apiKey),
  };
}

export function isVelobaseGatewayConfigured(): boolean {
  return Boolean(getVelobaseGatewayConfig().apiKey);
}

export function createVelobaseGatewayProvider(
  options: {
    customerId?: string;
    apiKey?: string;
    baseURL?: string;
    headers?: Record<string, string>;
  } = {},
): OpenAIProvider {
  const config = getVelobaseGatewayConfig(options);

  return createOpenAI({
    name: "velobase",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: buildGatewayHeaders(options.customerId, options.headers),
  });
}

export function createVelobaseGatewayChatModel(
  modelId: string,
  options: Parameters<typeof createVelobaseGatewayProvider>[0] = {},
) {
  return createVelobaseGatewayProvider(options).chat(modelId);
}

export async function listVelobaseGatewayModels(
  overrides: VelobaseGatewayConfigOverrides = {},
): Promise<VelobaseGatewayModel[]> {
  const config = assertConfigured(overrides);
  const { json } = await requestJson<VelobaseGatewayModelResponse>(
    "/models",
    { method: "GET" },
    config,
  );

  return parseModels(json);
}

export async function runVelobaseGatewayChatTest(
  input: VelobaseGatewayChatTestInput,
  overrides: VelobaseGatewayConfigOverrides = {},
): Promise<VelobaseGatewayChatTestResult> {
  const config = assertConfigured(overrides);
  const customerId =
    input.customerId?.trim() || env.VELOBASE_GATEWAY_TEST_CUSTOMER_ID;

  if (!customerId && config.keyKind !== "customer") {
    throw new VelobaseGatewayError(
      "Velobase Gateway project keys require X-Velobase-Customer. Configure VELOBASE_GATEWAY_TEST_CUSTOMER_ID or enter a customer id in the dashboard.",
      { retryable: false },
    );
  }

  const model = input.model?.trim() || config.defaultModel;
  const { json, headers } = await requestJson<VelobaseGatewayChatResponse>(
    "/chat/completions",
    {
      method: "POST",
      headers: buildGatewayHeaders(customerId),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: input.prompt }],
        max_tokens: input.maxTokens ?? 64,
        stream: false,
      }),
    },
    config,
  );

  return {
    ok: true,
    model,
    customerId,
    message: extractAssistantText(json),
    usage: extractUsage(json),
    billing: extractBillingHeaders(headers),
    checkedAt: new Date().toISOString(),
  };
}

function assertConfigured(
  overrides: VelobaseGatewayConfigOverrides,
): ResolvedVelobaseGatewayConfig {
  const config = getVelobaseGatewayConfig(overrides);

  if (!config.apiKey) {
    throw new VelobaseGatewayError(
      "Velobase Gateway API key is not configured. Set VELOBASE_GATEWAY_API_KEY or reuse VELOBASE_API_KEY.",
      { retryable: false },
    );
  }

  return config;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  config: ResolvedVelobaseGatewayConfig,
): Promise<{ json: T; headers: Headers }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(resolveUrl(config.baseURL, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    const rawText = await response.text();
    const json = parseJson<T>(rawText);

    if (!response.ok) {
      throw new VelobaseGatewayError(
        getErrorMessage(json, rawText) ??
          `Velobase Gateway request failed with ${response.status}`,
        {
          httpStatus: response.status,
          retryable: isRetryableStatus(response.status),
          providerRaw: json ?? rawText,
        },
      );
    }

    return {
      json: json ?? ({} as T),
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof VelobaseGatewayError) throw error;

    logger.warn({ err: error, path }, "Velobase Gateway request failed");
    throw new VelobaseGatewayError("Velobase Gateway request failed", {
      retryable: true,
      providerRaw: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildGatewayHeaders(
  customerId?: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    ...(customerId ? { "X-Velobase-Customer": customerId } : {}),
    ...headers,
  };
}

function extractBillingHeaders(
  headers: Headers,
): VelobaseGatewayBillingHeaders {
  return {
    costCents: headers.get("x-velobase-cost-cents") ?? undefined,
    costCredits: headers.get("x-velobase-cost-credits") ?? undefined,
    balanceCredits: headers.get("x-velobase-balance-credits") ?? undefined,
    transactionId: headers.get("x-velobase-transaction-id") ?? undefined,
  };
}

function extractUsage(
  response: VelobaseGatewayChatResponse,
): VelobaseGatewayUsage {
  return {
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
  };
}

function extractAssistantText(response: VelobaseGatewayChatResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text : undefined))
      .filter((part): part is string => Boolean(part))
      .join("");
  }

  return "";
}

function parseModels(
  response: VelobaseGatewayModelResponse,
): VelobaseGatewayModel[] {
  return (response.data ?? [])
    .filter(
      (model): model is Record<string, unknown> & { id: string } =>
        isRecord(model) && typeof model.id === "string",
    )
    .map((model) => ({
      id: model.id,
      object: typeof model.object === "string" ? model.object : undefined,
      created: typeof model.created === "number" ? model.created : undefined,
      ownedBy: typeof model.owned_by === "string" ? model.owned_by : undefined,
      providerRaw: model,
    }));
}

function parseJson<T>(text: string): T | undefined {
  if (!text) return undefined;

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function getErrorMessage(json: unknown, rawText: string): string | undefined {
  if (isRecord(json)) {
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message;
    }

    if (isRecord(json.error)) {
      const error = json.error;
      if (typeof error.message === "string" && error.message.trim()) {
        return error.message;
      }
      if (typeof error.code === "string" && error.code.trim()) {
        return error.code;
      }
    }
  }

  return rawText.trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getKeyKind(apiKey: string | undefined): VelobaseGatewayKeyKind {
  if (!apiKey) return "unknown";
  if (apiKey.startsWith("vb_live_")) return "project";
  if (apiKey.startsWith("vb_customer_")) return "customer";
  return "unknown";
}

function resolveUrl(baseURL: string, path: string): string {
  const normalizedBase = withoutTrailingSlash(baseURL);
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
