import { env } from "@/env";

function bool(val: string | undefined): boolean {
  return val === "true" || val === "1";
}

/**
 * Central module configuration.
 *
 * Each integration is auto-enabled when its required env vars are present,
 * but can be force-disabled by setting the corresponding DISABLE_* env var.
 */
export const MODULES = {
  integrations: {
    analytics: {
      posthog: {
        enabled:
          !bool(process.env.DISABLE_POSTHOG) &&
          !!(
            process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY
          ),
      },
      googleAds: {
        enabled:
          !bool(process.env.DISABLE_GOOGLE_ADS) &&
          !!(env.GOOGLE_ADS_CUSTOMER_ID && env.GOOGLE_ADS_DEVELOPER_TOKEN),
      },
    },
    messaging: {
      lark: {
        enabled:
          !bool(process.env.DISABLE_LARK) &&
          !!(env.LARK_APP_ID && env.LARK_APP_SECRET),
      },
      telegram: {
        enabled:
          !bool(process.env.DISABLE_TELEGRAM) &&
          !!env.TELEGRAM_BOT_TOKEN,
      },
    },
    payment: {
      nowpayments: {
        enabled:
          !bool(process.env.DISABLE_NOWPAYMENTS) &&
          !!env.NOWPAYMENTS_API_KEY,
      },
    },
  },
  features: {
    affiliate: {
      enabled: !bool(process.env.DISABLE_AFFILIATE),
    },
    touch: {
      enabled: !bool(process.env.DISABLE_TOUCH),
    },
    aiChat: {
      enabled:
        !bool(process.env.DISABLE_AI_CHAT) &&
        !!(
          env.ANTHROPIC_API_KEY ??
          env.OPENROUTER_API_KEY ??
          env.OPENAI_API_KEY
        ),
    },
  },
} as const;
