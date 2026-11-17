import type { Model } from "@earendil-works/pi-ai";
import {
  createModels,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { ModelRef } from "@earendil-works/pi-durable";
import { z } from "zod";

export interface OpenRouterChatModelAdapter {
  readonly provider: "openrouter";
  readonly modelId: string;
  readonly modelRef: ModelRef;
  readonly models: Models;
}

/** Selected technical adapter for Pi Durable; constructing it does not contact the provider. */
export function createOpenRouterChatModel(input: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): OpenRouterChatModelAdapter {
  const config = z
    .object({
      apiKey: z.string().trim().min(1).max(4096),
      model: z.string().trim().min(1).max(256),
      baseUrl: z.string().url().optional(),
    })
    .parse(input);

  const base = openrouterProvider();
  const baseUrl =
    config.baseUrl ?? base.baseUrl ?? "https://openrouter.ai/api/v1";
  const catalog = base.getModels();
  const hasModel = catalog.some((entry) => entry.id === config.model);
  const fallbackModel: Model<"openai-completions"> = {
    id: config.model,
    name: config.model,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };
  const chatModels = hasModel ? catalog : [...catalog, fallbackModel];

  const provider: Provider<"anthropic-messages" | "openai-completions"> = {
    ...base,
    baseUrl,
    auth: {
      apiKey: {
        name: "OpenRouter API key",
        check: async () => ({ source: "explicit", type: "api_key" as const }),
        resolve: async () => ({
          auth: {
            apiKey: config.apiKey,
            ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          },
          source: "explicit",
        }),
      },
    },
    getModels: () => chatModels,
    getAllModels: () => {
      const all = base.getAllModels?.() ?? catalog;
      return hasModel ? all : [...all, fallbackModel];
    },
  };

  const models = createModels();
  models.setProvider(provider);
  const modelRef: ModelRef = {
    provider: "openrouter",
    modelId: config.model,
  };

  return {
    provider: "openrouter",
    modelId: config.model,
    modelRef,
    models,
  };
}
