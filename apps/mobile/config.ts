import type { ExpoConfig } from "expo/config";
import { z } from "zod";

/** Runs at build time. Never spread process.env or root server env into extra. */
export function createMobileConfig(
  source: Record<string, string | undefined>,
): ExpoConfig {
  const environment = z
    .enum(["development", "production"])
    .default("production")
    .parse(source.VELOBASE_MOBILE_ENV);
  const url = new URL(
    z.string().url().parse(source.VELOBASE_MOBILE_API_ORIGIN),
  );
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
      "Mobile API origin must be HTTPS (HTTP is allowed only in development)",
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
