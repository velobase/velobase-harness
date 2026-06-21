import { env } from "@/env";
import type {
  SchedulerContribution,
  WorkerContribution,
} from "@/workers/types";
import {
  resolveModuleStates,
  type EnvReader,
  type ModuleDefinition,
  type ModuleId,
  type ModuleState,
} from "./manifest";

export const MODULE_DEFINITIONS = [
  {
    id: "posthog",
    kind: "integration",
    label: "PostHog",
    modeEnv: "POSTHOG_MODE",
    config: [
      {
        anyOf: ["POSTHOG_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY"],
        name: "PostHog API key",
      },
    ],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/posthog")).posthogModule,
  },
  {
    id: "google-ads",
    kind: "integration",
    label: "Google Ads",
    modeEnv: "GOOGLE_ADS_MODE",
    config: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/google-ads")).googleAdsModule,
    loadWorkerContributions: async () =>
      (
        await import("@/workers/integrations/google-ads")
      ).getGoogleAdsWorkerContributions(),
  },
  {
    id: "lark",
    kind: "integration",
    label: "Lark",
    modeEnv: "LARK_MODE",
    config: ["LARK_APP_ID", "LARK_APP_SECRET"],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/lark")).larkModule,
  },
  {
    id: "telegram",
    kind: "integration",
    label: "Telegram",
    modeEnv: "TELEGRAM_MODE",
    config: ["TELEGRAM_BOT_TOKEN"],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/telegram")).telegramModule,
  },
  {
    id: "stripe",
    kind: "integration",
    label: "Stripe",
    modeEnv: "STRIPE_MODE",
    config: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    loadWorkerContributions: async () =>
      (
        await import("@/workers/integrations/payment")
      ).getStripeWorkerContributions(),
  },
  {
    id: "lemonsqueezy",
    kind: "integration",
    label: "LemonSqueezy",
    modeEnv: "LEMONSQUEEZY_MODE",
    config: [
      "LEMONSQUEEZY_API_KEY",
      "LEMONSQUEEZY_STORE_ID",
      "LEMONSQUEEZY_WEBHOOK_SECRET",
    ],
  },
  {
    id: "nowpayments",
    kind: "integration",
    label: "NowPayments",
    modeEnv: "NOWPAYMENTS_MODE",
    config: ["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/nowpayments")).nowpaymentsModule,
    loadWorkerContributions: async () =>
      (
        await import("@/workers/integrations/payment")
      ).getNowPaymentsWorkerContributions(),
  },
  {
    id: "payment-reconciliation",
    kind: "integration",
    label: "Payment Reconciliation",
    modeEnv: "PAYMENT_RECONCILIATION_MODE",
    dependencies: [
      { anyOf: ["stripe", "nowpayments"], name: "payment provider" },
      "lark",
    ],
    loadWorkerContributions: async () =>
      (
        await import("@/workers/integrations/payment")
      ).getPaymentReconciliationWorkerContributions(),
  },
  {
    id: "affiliate",
    kind: "feature",
    label: "Affiliate",
    modeEnv: "AFFILIATE_MODE",
    loadFrameworkModule: async () =>
      (await import("@/server/modules/affiliate")).affiliateModule,
  },
  {
    id: "touch",
    kind: "feature",
    label: "Touch",
    modeEnv: "TOUCH_MODE",
    loadFrameworkModule: async () =>
      (await import("@/server/modules/touch")).touchModule,
    loadWorkerContributions: async () =>
      (await import("@/workers/features/touch")).getTouchWorkerContributions(),
  },
  {
    id: "support-automation",
    kind: "feature",
    label: "Support Automation",
    modeEnv: "SUPPORT_AUTOMATION_MODE",
    config: [
      "SUPPORT_EMAIL_ADDRESS",
      "SUPPORT_EMAIL_PASSWORD",
      "SUPPORT_IMAP_HOST",
      "SUPPORT_SMTP_HOST",
      "OPENROUTER_API_KEY",
    ],
    loadWorkerContributions: async () =>
      (
        await import("@/workers/features/support-automation")
      ).getSupportAutomationWorkerContributions(),
  },
  {
    id: "conversion-alert",
    kind: "feature",
    label: "Conversion Alert",
    modeEnv: "CONVERSION_ALERT_MODE",
    dependencies: ["lark"],
    loadWorkerContributions: async () =>
      (
        await import("@/workers/features/conversion-alert")
      ).getConversionAlertWorkerContributions(),
  },
  {
    id: "ai-chat",
    kind: "feature",
    label: "AI Chat",
    modeEnv: "AI_CHAT_MODE",
    config: [
      {
        anyOf: ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"],
        name: "AI provider key",
      },
    ],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/ai-chat")).aiChatModule,
  },
  {
    id: "velobase-gateway",
    kind: "integration",
    label: "Velobase Gateway",
    modeEnv: "VELOBASE_GATEWAY_MODE",
    config: [
      {
        anyOf: ["VELOBASE_GATEWAY_API_KEY", "VELOBASE_API_KEY"],
        name: "Velobase project or customer key",
      },
    ],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/velobase-gateway")).velobaseGatewayModule,
  },
  {
    id: "image-generation",
    kind: "feature",
    label: "Image Generation",
    modeEnv: "IMAGE_GENERATION_MODE",
    config: [
      "WAVESPEED_API_KEY",
      "WAVESPEED_BASE_URL",
      { anyOf: ["REDIS_URL", "REDIS_HOST"], name: "Redis connection" },
    ],
    loadFrameworkModule: async () =>
      (await import("@/server/modules/image-generation")).imageGenerationModule,
    loadWorkerContributions: async () =>
      (
        await import("@/workers/features/image-generation")
      ).getImageGenerationWorkerContributions(),
  },
] satisfies readonly ModuleDefinition[];

const MODULE_ENV = {
  POSTHOG_MODE: env.POSTHOG_MODE,
  GOOGLE_ADS_MODE: env.GOOGLE_ADS_MODE,
  LARK_MODE: env.LARK_MODE,
  TELEGRAM_MODE: env.TELEGRAM_MODE,
  STRIPE_MODE: env.STRIPE_MODE,
  LEMONSQUEEZY_MODE: env.LEMONSQUEEZY_MODE,
  NOWPAYMENTS_MODE: env.NOWPAYMENTS_MODE,
  PAYMENT_RECONCILIATION_MODE: env.PAYMENT_RECONCILIATION_MODE,
  AFFILIATE_MODE: env.AFFILIATE_MODE,
  TOUCH_MODE: env.TOUCH_MODE,
  SUPPORT_AUTOMATION_MODE: env.SUPPORT_AUTOMATION_MODE,
  CONVERSION_ALERT_MODE: env.CONVERSION_ALERT_MODE,
  AI_CHAT_MODE: env.AI_CHAT_MODE,
  VELOBASE_GATEWAY_MODE: env.VELOBASE_GATEWAY_MODE,
  IMAGE_GENERATION_MODE: env.IMAGE_GENERATION_MODE,
  SUPPORT_EMAIL_ADDRESS: env.SUPPORT_EMAIL_ADDRESS,
  SUPPORT_EMAIL_PASSWORD: env.SUPPORT_EMAIL_PASSWORD,
  SUPPORT_IMAP_HOST: env.SUPPORT_IMAP_HOST,
  SUPPORT_SMTP_HOST: env.SUPPORT_SMTP_HOST,
  POSTHOG_API_KEY: env.POSTHOG_API_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: env.NEXT_PUBLIC_POSTHOG_KEY,
  GOOGLE_ADS_CUSTOMER_ID: env.GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_DEVELOPER_TOKEN: env.GOOGLE_ADS_DEVELOPER_TOKEN,
  LARK_APP_ID: env.LARK_APP_ID,
  LARK_APP_SECRET: env.LARK_APP_SECRET,
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
  LEMONSQUEEZY_API_KEY: env.LEMONSQUEEZY_API_KEY,
  LEMONSQUEEZY_STORE_ID: env.LEMONSQUEEZY_STORE_ID,
  LEMONSQUEEZY_WEBHOOK_SECRET: env.LEMONSQUEEZY_WEBHOOK_SECRET,
  NOWPAYMENTS_API_KEY: env.NOWPAYMENTS_API_KEY,
  NOWPAYMENTS_IPN_SECRET: env.NOWPAYMENTS_IPN_SECRET,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  VELOBASE_API_KEY: env.VELOBASE_API_KEY,
  VELOBASE_GATEWAY_API_KEY: env.VELOBASE_GATEWAY_API_KEY,
  WAVESPEED_API_KEY: env.WAVESPEED_API_KEY,
  WAVESPEED_BASE_URL: env.WAVESPEED_BASE_URL,
  REDIS_URL: env.REDIS_URL,
  REDIS_HOST: env.REDIS_HOST,
} satisfies EnvReader;

export const MODULE_STATES = resolveModuleStates(
  MODULE_DEFINITIONS,
  MODULE_ENV,
);

const STATE_BY_ID = new Map(MODULE_STATES.map((state) => [state.id, state]));

export const MODULES = {
  integrations: {
    analytics: {
      posthog: {
        enabled: isModuleEnabled("posthog"),
      },
      googleAds: {
        enabled: isModuleEnabled("google-ads"),
      },
    },
    messaging: {
      lark: {
        enabled: isModuleEnabled("lark"),
      },
      telegram: {
        enabled: isModuleEnabled("telegram"),
      },
    },
    payment: {
      stripe: {
        enabled: isModuleEnabled("stripe"),
      },
      lemonsqueezy: {
        enabled: isModuleEnabled("lemonsqueezy"),
      },
      nowpayments: {
        enabled: isModuleEnabled("nowpayments"),
      },
      reconciliation: {
        enabled: isModuleEnabled("payment-reconciliation"),
      },
    },
    ai: {
      velobaseGateway: {
        enabled: isModuleEnabled("velobase-gateway"),
      },
    },
  },
  features: {
    affiliate: {
      enabled: isModuleEnabled("affiliate"),
    },
    touch: {
      enabled: isModuleEnabled("touch"),
    },
    supportAutomation: {
      enabled: isModuleEnabled("support-automation"),
    },
    conversionAlert: {
      enabled: isModuleEnabled("conversion-alert"),
    },
    aiChat: {
      enabled: isModuleEnabled("ai-chat"),
    },
    imageGeneration: {
      enabled: isModuleEnabled("image-generation"),
    },
  },
} as const;

export function getModuleState(id: ModuleId): ModuleState | undefined {
  return STATE_BY_ID.get(id);
}

export function isModuleEnabled(id: ModuleId): boolean {
  return STATE_BY_ID.get(id)?.enabled ?? false;
}

export function getEnabledModuleDefinitions(): ModuleDefinition[] {
  return MODULE_DEFINITIONS.filter((definition) =>
    isModuleEnabled(definition.id),
  );
}

export async function collectEnabledWorkerContributions(): Promise<
  WorkerContribution[]
> {
  const loaders = getEnabledModuleDefinitions()
    .map((definition) => definition.loadWorkerContributions)
    .filter((loader): loader is () => Promise<WorkerContribution[]> =>
      Boolean(loader),
    );

  const contributionGroups = await Promise.all(
    loaders.map((loader) => loader()),
  );

  return contributionGroups.flat();
}

export async function collectDisabledSchedulerContributions(): Promise<
  SchedulerContribution[]
> {
  const schedulerById = new Map<string, SchedulerContribution>();
  const disabledDefinitions = MODULE_DEFINITIONS.filter(
    (definition) => !isModuleEnabled(definition.id),
  );

  for (const definition of disabledDefinitions) {
    if (!definition.loadWorkerContributions) continue;

    const contributions = await definition.loadWorkerContributions();
    for (const contribution of contributions) {
      const scheduler = contribution.scheduler;
      if (!scheduler?.remove) continue;
      schedulerById.set(scheduler.id, scheduler);
    }
  }

  return Array.from(schedulerById.values());
}
