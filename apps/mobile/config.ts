import type { ExpoConfig } from "expo/config";
import { z } from "zod";

/** Runs at build time. Never spread process.env or root server env into extra. */
export function createMobileConfig(
  source: Record<string, string | undefined>,
): ExpoConfig {
  const environmentResult = z
    .enum(["development", "production"])
    .default("production")
    .safeParse(source.VELOBASE_MOBILE_ENV);
  if (!environmentResult.success) {
    // Expo annotates Error.message; ZodError.message is a getter. Do not expose input values.
    throw new Error("VELOBASE_MOBILE_ENV must be development or production");
  }
  const originResult = z
    .string()
    .url()
    .safeParse(source.VELOBASE_MOBILE_API_ORIGIN);
  if (!originResult.success) {
    throw new Error(
      "VELOBASE_MOBILE_API_ORIGIN must be an explicit valid server origin",
    );
  }
  const environment = environmentResult.data;
  const url = new URL(originResult.data);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(environment === "development" && url.protocol === "http:"))
  ) {
    throw new Error(
      "VELOBASE_MOBILE_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment (HTTP is allowed only in development)",
    );
  }
  return {
    name: "Velobase",
    slug: "velobase-mobile",
    version: "0.1.0",
    scheme: "velobase",
    platforms: ["android", "ios"],
    ios: { bundleIdentifier: "org.velobase.harness", supportsTablet: true },
    android: { package: "org.velobase.harness", allowBackup: false },
    extra: { apiOrigin: url.origin },
  };
}
