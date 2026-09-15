/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "../../src/env.js";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  transpilePackages: [
    "@velobase/ai-chat",
    "@velobase/ai-chat-openrouter",
    "@velobase/image-generation",
    "@velobase/image-generation-wavespeed",
    "@velobase/image-generation-modelrunner",
    "@velobase/contracts",
    "@velobase/api-client",
    "@velobase/module-runtime",
    "@velobase/example-composition",
    "@velobase/mailbox",
    "@velobase/email-transport",
    "@velobase/sharing",
    "@velobase/activities",
    "@velobase/outreach",
    "@velobase/affiliate",
    "@velobase/credits",
    "@velobase/products",
    "@velobase/payments",
    "@velobase/payments-stripe",
    "@velobase/subscriptions",
    "@velobase/subscriptions-stripe",
    "@velobase/credits-velobase",
  ],
  typescript: {
    ignoreBuildErrors: false,
  },
  // Load server SDKs through Node: their generated clients do not need Webpack
  // transforms, which otherwise make even the first page expensive to compile.
  serverExternalPackages: [
    "sharp",
    "posthog-node",
    "google-ads-api",
    "@larksuiteoapi/node-sdk",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "nowpayments.io",
      },
    ],
  },
};

export default withNextIntl(config);
