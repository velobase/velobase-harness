import { env } from "@/env";

// The Compose preview uses the existing application and an isolated local database.
const origin = env.AUTH_URL ? new URL(env.AUTH_URL) : undefined;
export const localDemoEnabled =
  env.NEXT_PUBLIC_LOCAL_DEMO === "on" &&
  env.NODE_ENV === "development" &&
  origin?.protocol === "http:" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);

export const localDemoEmail = "demo@harness.local";
