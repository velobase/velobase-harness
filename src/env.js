import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    AUTH_DISCORD_ID: z.string().optional(),
    AUTH_DISCORD_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    DATABASE_URL: z.string().url(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.string().transform((val) => parseInt(val, 10)),
    REDIS_USER: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.string().transform((val) => parseInt(val, 10)).default("0"),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    CDN_BASE_URL: z.string().url().optional(),
    STORAGE_PROVIDER: z.enum(["aws", "aliyun", "gcs", "minio", "r2"]).optional().default("aws"),
    STORAGE_REGION: z.string().optional(),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_ENDPOINT: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Force payment gateway for testing (bypasses default Stripe routing)
    FORCE_PAYMENT_GATEWAY: z.enum(["STRIPE", "NOWPAYMENTS"]).optional(),
    NOWPAYMENTS_API_KEY: z.string().optional(),
    NOWPAYMENTS_IPN_SECRET: z.string().optional(),
    NOWPAYMENTS_PAY_CURRENCY: z.string().optional().default("usdttrc20"),
    // Google Ads
    GOOGLE_ADS_CLIENT_ID: z.string().optional(),
    GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
    GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_ADS_MCC_ID: z.string().optional(),
    GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
    GOOGLE_ADS_CONVERSION_ACTION_ID: z.string().optional(),
    // Web purchase conversion action (WEBPAGE) used for Enhanced Conversions API (ConversionAdjustment ENHANCEMENT)
    GOOGLE_ADS_WEB_CONVERSION_ACTION_ID: z.string().optional(),
    DATALAB_API_KEY: z.string().optional(),
    DATALAB_BASE_URL: z.string().url().optional().default("https://api.datalab.to"),
    XAI_API_KEY: z.string().optional(),
    // Email Services
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    EMAIL_PROVIDER: z.string().optional().default("resend,sendgrid"),
    // Lark Bot
    LARK_APP_ID: z.string().optional(),
    LARK_APP_SECRET: z.string().optional(),
    LARK_USE_FEISHU: z.string().optional().transform((val) => val === 'true'),
    LARK_DEFAULT_CHAT_ID: z.string().optional(),
    LARK_ENCRYPT_KEY: z.string().optional(),
    LARK_VERIFICATION_TOKEN: z.string().optional(),
    // Feishu Bot (国内飞书)
    FEISHU_APP_ID: z.string().optional(),
    FEISHU_APP_SECRET: z.string().optional(),
    // Telegram Bot (Stars payment)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    // Cloudflare Turnstile
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // Velobase Billing
    VELOBASE_API_KEY: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_USER: process.env.REDIS_USER,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: process.env.REDIS_DB,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    CDN_BASE_URL: process.env.CDN_BASE_URL,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    STORAGE_REGION: process.env.STORAGE_REGION,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    FORCE_PAYMENT_GATEWAY: process.env.FORCE_PAYMENT_GATEWAY,
    NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
    NOWPAYMENTS_IPN_SECRET: process.env.NOWPAYMENTS_IPN_SECRET,
    NOWPAYMENTS_PAY_CURRENCY: process.env.NOWPAYMENTS_PAY_CURRENCY,
    GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    GOOGLE_ADS_MCC_ID: process.env.GOOGLE_ADS_MCC_ID,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_CONVERSION_ACTION_ID: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID,
    GOOGLE_ADS_WEB_CONVERSION_ACTION_ID: process.env.GOOGLE_ADS_WEB_CONVERSION_ACTION_ID,
    DATALAB_API_KEY: process.env.DATALAB_API_KEY,
    DATALAB_BASE_URL: process.env.DATALAB_BASE_URL,
    XAI_API_KEY: process.env.XAI_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    LARK_APP_ID: process.env.LARK_APP_ID,
    LARK_APP_SECRET: process.env.LARK_APP_SECRET,
    LARK_USE_FEISHU: process.env.LARK_USE_FEISHU,
    LARK_DEFAULT_CHAT_ID: process.env.LARK_DEFAULT_CHAT_ID,
    LARK_ENCRYPT_KEY: process.env.LARK_ENCRYPT_KEY,
    LARK_VERIFICATION_TOKEN: process.env.LARK_VERIFICATION_TOKEN,
    FEISHU_APP_ID: process.env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    VELOBASE_API_KEY: process.env.VELOBASE_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
