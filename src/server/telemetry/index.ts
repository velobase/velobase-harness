import { env } from "@/env";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

// Shared across Next.js bundles and development reloads. One provider per process.
const state = globalThis as typeof globalThis & {
  __harnessWebTelemetryShutdown?: boolean;
  __harnessTelemetry?: {
    starting: Promise<NodeTracerProvider>;
    stopping?: Promise<void>;
  };
};

export async function initTelemetry(service: string): Promise<void> {
  if (env.OTEL_ENABLED !== "true") return;
  state.__harnessTelemetry ??= {
    starting: import("./sdk").then(({ startTelemetry }) =>
      startTelemetry(service),
    ),
  };
  await state.__harnessTelemetry.starting;
}

/** Call after HTTP requests and workers have drained, before process.exit(). */
export async function shutdownTelemetry(): Promise<void> {
  const telemetry = state.__harnessTelemetry;
  if (!telemetry) return;
  telemetry.stopping ??= telemetry.starting.then((provider) =>
    provider.shutdown(),
  );
  await telemetry.stopping;
}

/** Next owns its process lifecycle; start flushing as soon as shutdown begins. */
export function registerWebTelemetryShutdown(): void {
  if (env.OTEL_ENABLED !== "true" || state.__harnessWebTelemetryShutdown)
    return;
  state.__harnessWebTelemetryShutdown = true;
  const shutdown = () => {
    void shutdownTelemetry().catch(() => undefined);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("beforeExit", shutdown);
}
