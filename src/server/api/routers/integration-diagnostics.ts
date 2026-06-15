import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "@/env";
import { MODULES } from "@/config/modules";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";

const wavespeedImageTestInput = z.object({
  prompt: z.string().min(1).max(8000),
  model: z.string().min(1).max(200).default("wavespeed-ai/flux-dev"),
  aspectRatio: z.string().min(1).max(20).default("1:1"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  resolution: z.enum(["1k", "2k", "4k"]).default("1k"),
  outputFormat: z.enum(["png", "jpeg", "webp"]).default("png"),
});

const taskInput = z.object({
  taskId: z.string().min(1),
});

export const integrationDiagnosticsRouter = createTRPCRouter({
  wavespeedStatus: adminProcedure.query(() => {
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
      moduleEnabled: MODULES.features.imageGeneration.enabled,
      connectionConfigReady: connectionConfig.every((item) => item.configured),
      generationConfigReady:
        MODULES.features.imageGeneration.enabled &&
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

function assertImageGenerationEnabled(): void {
  if (!MODULES.features.imageGeneration.enabled) {
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
