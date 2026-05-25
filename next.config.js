/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  // Ensure server-only native packages are not bundled for the browser
  serverExternalPackages: ["sharp", "posthog-node"],
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
