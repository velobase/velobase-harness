import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "@/env";
import { getModuleState, MODULES } from "@/config/modules";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";

const wavespeedImageTestInput = z.object({
  prompt: z.string().min(1).max(8000),
  model: z.string().min(1).max(200).default("wavespeed-ai/flux-dev"),
  aspectRatio: z.string().min(1).max(20).default("1:1"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  resolution: z.enum(["1k", "2k", "4k"]).default("1k"),
  outputFormat: z.enum(["png", "jpeg", "webp"]).default("png"),
});

const velobaseGatewayChatTestInput = z.object({
  customerId: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().min(1).max(2000),
  maxTokens: z.number().int().min(1).max(512).default(64),
});

const taskInput = z.object({
  taskId: z.string().min(1),
});

function envStatus(keys: string[]) {
  return keys.map((key) => ({
    key,
    configured: Boolean(env[key as keyof typeof env]),
  }));
}

function missingEnv(keys: string[]) {
  return keys.filter((key) => !env[key as keyof typeof env]);
}

const lemonSqueezyEnvKeys = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
];

export const integrationDiagnosticsRouter = createTRPCRouter({
  moduleStatusInventory: adminProcedure.query(() => {
    const posthogState = getModuleState("posthog");
    const googleAdsState = getModuleState("google-ads");
    const larkState = getModuleState("lark");
    const telegramState = getModuleState("telegram");
    const stripeState = getModuleState("stripe");
    const lemonSqueezyState = getModuleState("lemonsqueezy");
    const nowpaymentsState = getModuleState("nowpayments");
    const aiChatState = getModuleState("ai-chat");
    const imageGenerationState = getModuleState("image-generation");
    const supportAutomationState = getModuleState("support-automation");
    const velobaseGatewayState = getModuleState("velobase-gateway");

    return {
      checkedAt: new Date().toISOString(),
      modules: [
        {
          id: "posthog",
          label: "PostHog",
          category: "analytics",
          enabled: posthogState?.enabled ?? false,
          configured: posthogState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["POSTHOG_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY"]),
          missingEnv: posthogState?.missingEnv ?? [],
        },
        {
          id: "google-ads",
          label: "Google Ads",
          category: "analytics",
          enabled: googleAdsState?.enabled ?? false,
          configured: googleAdsState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus([
            "GOOGLE_ADS_CUSTOMER_ID",
            "GOOGLE_ADS_DEVELOPER_TOKEN",
          ]),
          missingEnv: googleAdsState?.missingEnv ?? [],
        },
        {
          id: "lark",
          label: "Lark",
          category: "messaging",
          enabled: larkState?.enabled ?? false,
          configured: larkState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["LARK_APP_ID", "LARK_APP_SECRET"]),
          missingEnv: larkState?.missingEnv ?? [],
        },
        {
          id: "telegram",
          label: "Telegram",
          category: "messaging",
          enabled: telegramState?.enabled ?? false,
          configured: telegramState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["TELEGRAM_BOT_TOKEN"]),
          missingEnv: telegramState?.missingEnv ?? [],
        },
        {
          id: "stripe",
          label: "Stripe",
          category: "payment",
          enabled: stripeState?.enabled ?? false,
          configured: stripeState?.configured ?? false,
          implementationPresent: true,
          testKey: "payment:STRIPE",
          config: envStatus(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
          missingEnv: stripeState?.missingEnv ?? [],
        },
        {
          id: "lemonsqueezy",
          label: "LemonSqueezy",
          category: "payment",
          enabled: lemonSqueezyState?.enabled ?? false,
          configured: lemonSqueezyState?.configured ?? false,
          implementationPresent: true,
          testKey: "payment:LEMONSQUEEZY",
          config: envStatus(lemonSqueezyEnvKeys),
          missingEnv: lemonSqueezyState?.missingEnv ?? [],
        },
        {
          id: "nowpayments",
          label: "NowPayments",
          category: "payment",
          enabled: nowpaymentsState?.enabled ?? false,
          configured: nowpaymentsState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"]),
          missingEnv: nowpaymentsState?.missingEnv ?? [],
        },
        {
          id: "velobase-gateway",
          label: "Velobase Gateway",
          category: "llm",
          enabled: velobaseGatewayState?.enabled ?? false,
          configured: velobaseGatewayState?.configured ?? false,
          implementationPresent: true,
          testKey: "llm:velobase-gateway",
          config: envStatus(["VELOBASE_GATEWAY_API_KEY", "VELOBASE_API_KEY"]),
          missingEnv: velobaseGatewayState?.missingEnv ?? [],
        },
        {
          id: "wavespeed",
          label: "WaveSpeedAI",
          category: "llm",
          enabled: imageGenerationState?.enabled ?? false,
          configured: imageGenerationState?.configured ?? false,
          implementationPresent: true,
          testKey: "llm:wavespeed",
          config: envStatus(["WAVESPEED_API_KEY", "WAVESPEED_BASE_URL"]),
          missingEnv: imageGenerationState?.missingEnv ?? [],
        },
        {
          id: "ai-chat-openrouter",
          label: "AI Chat / OpenRouter",
          category: "llm",
          enabled: aiChatState?.enabled ?? false,
          configured: aiChatState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["OPENROUTER_API_KEY"]),
          missingEnv: aiChatState?.missingEnv ?? [],
        },
        {
          id: "support-automation-openrouter",
          label: "Support Automation / OpenRouter",
          category: "llm",
          enabled: supportAutomationState?.enabled ?? false,
          configured: supportAutomationState?.configured ?? false,
          implementationPresent: true,
          testKey: null,
          config: envStatus(["OPENROUTER_API_KEY"]),
          missingEnv: supportAutomationState?.missingEnv ?? [],
        },
        {
          id: "openai-direct",
          label: "OpenAI-compatible env",
          category: "llm",
          enabled: Boolean(env.OPENAI_API_KEY),
          configured: Boolean(env.OPENAI_API_KEY),
          implementationPresent: false,
          testKey: null,
          config: envStatus(["OPENAI_API_KEY", "OPENAI_BASE_URL"]),
          missingEnv: missingEnv(["OPENAI_API_KEY"]),
        },
        {
          id: "anthropic-direct",
          label: "Anthropic env",
          category: "llm",
          enabled: Boolean(env.ANTHROPIC_API_KEY),
          configured: Boolean(env.ANTHROPIC_API_KEY),
          implementationPresent: false,
          testKey: null,
          config: envStatus(["ANTHROPIC_API_KEY"]),
          missingEnv: missingEnv(["ANTHROPIC_API_KEY"]),
        },
        {
          id: "xai-env",
          label: "xAI env",
          category: "llm",
          enabled: Boolean(env.XAI_API_KEY),
          configured: Boolean(env.XAI_API_KEY),
          implementationPresent: false,
          testKey: null,
          config: envStatus(["XAI_API_KEY"]),
          missingEnv: missingEnv(["XAI_API_KEY"]),
        },
      ],
    };
  }),

  paymentTestInventory: adminProcedure.query(() => {
    const stripeState = getModuleState("stripe");
    const lemonSqueezyState = getModuleState("lemonsqueezy");
    const nowpaymentsState = getModuleState("nowpayments");

    return {
      checkedAt: new Date().toISOString(),
      providers: [
        {
          id: "STRIPE" as const,
          moduleId: "stripe",
          label: "Stripe",
          enabled: MODULES.integrations.payment.stripe.enabled,
          configured: stripeState?.configured ?? false,
          implementationPresent: true,
          testPath: null,
          config: envStatus(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
          missingEnv: stripeState?.missingEnv ?? [],
        },
        {
          id: "LEMONSQUEEZY" as const,
          moduleId: "lemonsqueezy",
          label: "LemonSqueezy",
          enabled: lemonSqueezyState?.enabled ?? false,
          configured: lemonSqueezyState?.configured ?? false,
          implementationPresent: true,
          testPath: null,
          config: envStatus(lemonSqueezyEnvKeys),
          missingEnv: lemonSqueezyState?.missingEnv ?? [],
          removedInCurrentBranch: false,
        },
        {
          id: "NOWPAYMENTS" as const,
          moduleId: "nowpayments",
          label: "NowPayments",
          enabled: MODULES.integrations.payment.nowpayments.enabled,
          configured: nowpaymentsState?.configured ?? false,
          implementationPresent: true,
          testPath: null,
          config: envStatus(["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"]),
          missingEnv: nowpaymentsState?.missingEnv ?? [],
        },
      ],
    };
  }),

  llmIntegrationInventory: adminProcedure.query(() => {
    const aiChatState = getModuleState("ai-chat");
    const imageGenerationState = getModuleState("image-generation");
    const supportAutomationState = getModuleState("support-automation");
    const velobaseGatewayState = getModuleState("velobase-gateway");

    return {
      checkedAt: new Date().toISOString(),
      module: {
        id: "llm",
        label: "LLM",
      },
      integrations: [
        {
          id: "velobase-gateway",
          label: "Velobase Gateway",
          moduleId: "velobase-gateway",
          category: "gateway",
          enabled: velobaseGatewayState?.enabled ?? false,
          configured: velobaseGatewayState?.configured ?? false,
          implementationPresent: true,
          testAvailable: true,
          testPath: null,
          config: envStatus(["VELOBASE_GATEWAY_API_KEY", "VELOBASE_API_KEY"]),
          missingEnv: velobaseGatewayState?.missingEnv ?? [],
        },
        {
          id: "wavespeed",
          label: "WaveSpeedAI",
          moduleId: "image-generation",
          category: "image-generation",
          enabled: imageGenerationState?.enabled ?? false,
          configured: imageGenerationState?.configured ?? false,
          implementationPresent: true,
          testAvailable: true,
          testPath: null,
          config: envStatus(["WAVESPEED_API_KEY", "WAVESPEED_BASE_URL"]),
          missingEnv: imageGenerationState?.missingEnv ?? [],
        },
        {
          id: "ai-chat-openrouter",
          label: "AI Chat / OpenRouter",
          moduleId: "ai-chat",
          category: "chat",
          enabled: MODULES.features.aiChat.enabled,
          configured: aiChatState?.configured ?? false,
          implementationPresent: true,
          testAvailable: false,
          testPath: null,
          config: envStatus(["OPENROUTER_API_KEY"]),
          missingEnv: aiChatState?.missingEnv ?? [],
        },
        {
          id: "support-automation-openrouter",
          label: "Support Automation / OpenRouter",
          moduleId: "support-automation",
          category: "support",
          enabled: MODULES.features.supportAutomation.enabled,
          configured: supportAutomationState?.configured ?? false,
          implementationPresent: true,
          testAvailable: false,
          testPath: null,
          config: envStatus(["OPENROUTER_API_KEY"]),
          missingEnv: supportAutomationState?.missingEnv ?? [],
        },
        {
          id: "openai-direct",
          label: "OpenAI-compatible env",
          moduleId: null,
          category: "env",
          enabled: Boolean(env.OPENAI_API_KEY),
          configured: Boolean(env.OPENAI_API_KEY),
          implementationPresent: false,
          testAvailable: false,
          testPath: null,
          config: envStatus(["OPENAI_API_KEY", "OPENAI_BASE_URL"]),
          missingEnv: missingEnv(["OPENAI_API_KEY"]),
        },
        {
          id: "anthropic-direct",
          label: "Anthropic env",
          moduleId: null,
          category: "env",
          enabled: Boolean(env.ANTHROPIC_API_KEY),
          configured: Boolean(env.ANTHROPIC_API_KEY),
          implementationPresent: false,
          testAvailable: false,
          testPath: null,
          config: envStatus(["ANTHROPIC_API_KEY"]),
          missingEnv: missingEnv(["ANTHROPIC_API_KEY"]),
        },
        {
          id: "xai-env",
          label: "xAI env",
          moduleId: null,
          category: "env",
          enabled: Boolean(env.XAI_API_KEY),
          configured: Boolean(env.XAI_API_KEY),
          implementationPresent: false,
          testAvailable: false,
          testPath: null,
          config: envStatus(["XAI_API_KEY"]),
          missingEnv: missingEnv(["XAI_API_KEY"]),
        },
      ],
    };
  }),

  velobaseGatewayStatus: adminProcedure.query(async ({ ctx }) => {
    const { getVelobaseGatewayConfig } =
      await import("@/server/ai/velobase-gateway");
    const config = getVelobaseGatewayConfig();
    const currentCustomerId = ctx.session.user.id;
    const defaultTestCustomerId =
      env.VELOBASE_GATEWAY_TEST_CUSTOMER_ID ?? currentCustomerId;
    const connectionConfig = [
      {
        key: "VELOBASE_GATEWAY_API_KEY or VELOBASE_API_KEY",
        configured: Boolean(config.apiKey),
      },
      {
        key: "VELOBASE_GATEWAY_BASE_URL",
        configured: Boolean(config.baseURL),
      },
    ];
    const smokeConfig = [
      {
        key: "VELOBASE_GATEWAY_DEFAULT_MODEL",
        configured: Boolean(config.defaultModel),
      },
      {
        key: "VELOBASE_GATEWAY_TEST_CUSTOMER_ID or current user id",
        configured:
          config.keyKind === "customer" || Boolean(defaultTestCustomerId),
      },
    ];

    return {
      provider: "velobase-gateway" as const,
      moduleEnabled: MODULES.integrations.ai.velobaseGateway.enabled,
      connectionConfigReady: connectionConfig.every((item) => item.configured),
      smokeConfigReady:
        connectionConfig.every((item) => item.configured) &&
        smokeConfig.every((item) => item.configured),
      checkedAt: new Date().toISOString(),
      baseURL: config.baseURL,
      defaultModel: config.defaultModel,
      keyKind: config.keyKind,
      requiresCustomerHeader: config.keyKind !== "customer",
      currentCustomerId,
      defaultTestCustomerId,
      connectionConfig,
      smokeConfig,
      optionalConfig: [
        {
          key: "VELOBASE_GATEWAY_API_KEY",
          configured: config.hasDedicatedGatewayKey,
        },
        {
          key: "VELOBASE_API_KEY",
          configured: config.hasBillingKey,
        },
        {
          key: "VELOBASE_GATEWAY_REQUEST_TIMEOUT_MS",
          configured: Boolean(env.VELOBASE_GATEWAY_REQUEST_TIMEOUT_MS),
        },
      ],
    };
  }),

  testVelobaseGatewayConnection: adminProcedure.mutation(async () => {
    assertVelobaseGatewayEnabled();

    try {
      const { listVelobaseGatewayModels } =
        await import("@/server/ai/velobase-gateway");
      const models = await listVelobaseGatewayModels();

      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        modelCount: models.length,
        sampleModels: models.slice(0, 8).map((model) => ({
          id: model.id,
          object: model.object,
          ownedBy: model.ownedBy,
        })),
      };
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "Velobase Gateway connection test failed",
      });
    }
  }),

  runVelobaseGatewayChatTest: adminProcedure
    .input(velobaseGatewayChatTestInput)
    .mutation(async ({ ctx, input }) => {
      assertVelobaseGatewayEnabled();

      try {
        const { getVelobaseGatewayConfig, runVelobaseGatewayChatTest } =
          await import("@/server/ai/velobase-gateway");
        const config = getVelobaseGatewayConfig();
        const customerId =
          input.customerId?.trim() ||
          env.VELOBASE_GATEWAY_TEST_CUSTOMER_ID ||
          (config.keyKind === "customer" ? undefined : ctx.session.user.id);

        return await runVelobaseGatewayChatTest({
          ...input,
          customerId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Velobase Gateway chat test failed",
        });
      }
    }),

  wavespeedStatus: adminProcedure.query(() => {
    const imageGenerationState = getModuleState("image-generation");
    const connectionConfig = [
      {
        key: "WAVESPEED_API_KEY",
        configured: Boolean(env.WAVESPEED_API_KEY),
      },
      {
        key: "WAVESPEED_BASE_URL",
        configured: Boolean(env.WAVESPEED_BASE_URL),
      },
    ];
    const generationConfig = [
      {
        key: "REDIS_URL or REDIS_HOST",
        configured: Boolean(env.REDIS_URL || env.REDIS_HOST),
      },
      {
        key: "R2 storage or filesystem fallback",
        configured: true,
      },
    ];

    return {
      provider: "wavespeed" as const,
      moduleEnabled: imageGenerationState?.enabled ?? false,
      connectionConfigReady: connectionConfig.every((item) => item.configured),
      generationConfigReady:
        (imageGenerationState?.enabled ?? false) &&
        generationConfig.every((item) => item.configured),
      checkedAt: new Date().toISOString(),
      connectionConfig,
      generationConfig,
      optionalConfig: [
        {
          key: "WAVESPEED_REQUEST_TIMEOUT_MS",
          configured: Boolean(env.WAVESPEED_REQUEST_TIMEOUT_MS),
        },
        {
          key: "STORAGE_PROVIDER",
          configured: Boolean(env.STORAGE_PROVIDER),
        },
        {
          key: "STORAGE_BUCKET",
          configured: Boolean(env.STORAGE_BUCKET),
        },
        {
          key: "STORAGE_FILESYSTEM_ROOT",
          configured: Boolean(env.STORAGE_FILESYSTEM_ROOT),
        },
      ],
    };
  }),

  testWavespeedConnection: adminProcedure.mutation(async () => {
    assertImageGenerationEnabled();
    assertWavespeedConnectionConfigured();

    try {
      const { getImageGenerationProvider } =
        await import("@/server/ai/image-generation/providers/registry");
      const provider = getImageGenerationProvider("wavespeed");
      const [capabilities, models] = await Promise.all([
        Promise.resolve(provider.getCapabilities()),
        provider.listModels(),
      ]);

      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        capabilities,
        modelCount: models.length,
        sampleModels: models.slice(0, 8).map((model) => ({
          id: model.id,
          name: model.name,
          type: model.type,
          basePriceUsd: model.basePriceUsd,
        })),
      };
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "WaveSpeed connection test failed",
      });
    }
  }),

  runWavespeedImageTest: adminProcedure
    .input(wavespeedImageTestInput)
    .mutation(async ({ ctx, input }) => {
      assertImageGenerationEnabled();

      const { imageGeneration } = await import("@/server/ai/image-generation");
      const task = await imageGeneration.createTask({
        provider: "wavespeed",
        model: input.model,
        operation: "text-to-image",
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        quality: input.quality,
        resolution: input.resolution,
        outputFormat: input.outputFormat,
        userId: ctx.session.user.id,
        metadata: {
          source: "dashboard-wavespeed-test",
        },
      });

      return task;
    }),

  imageGenerationTask: adminProcedure
    .input(taskInput)
    .query(async ({ ctx, input }) => {
      assertImageGenerationEnabled();

      const { imageGeneration } = await import("@/server/ai/image-generation");
      const task = await imageGeneration.getTask(input.taskId, {
        userId: ctx.session.user.id,
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Image generation task not found",
        });
      }

      return task;
    }),
});

function assertVelobaseGatewayEnabled(): void {
  const velobaseGatewayState = getModuleState("velobase-gateway");
  if (!velobaseGatewayState?.enabled) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Velobase Gateway is not enabled. Set VELOBASE_GATEWAY_MODE=auto and configure VELOBASE_GATEWAY_API_KEY or VELOBASE_API_KEY.",
    });
  }
}

function assertImageGenerationEnabled(): void {
  const imageGenerationState = getModuleState("image-generation");
  if (!imageGenerationState?.enabled) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Image generation is not enabled. Set IMAGE_GENERATION_MODE=auto and configure WaveSpeed + Redis env vars.",
    });
  }
}

function assertWavespeedConnectionConfigured(): void {
  const missingConfig = [
    env.WAVESPEED_API_KEY ? null : "WAVESPEED_API_KEY",
    env.WAVESPEED_BASE_URL ? null : "WAVESPEED_BASE_URL",
  ].filter(Boolean);

  if (missingConfig.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `WaveSpeed connection config is incomplete: ${missingConfig.join(
        ", ",
      )}`,
    });
  }
}
