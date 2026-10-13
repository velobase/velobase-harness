import assert from "node:assert/strict";
import test from "node:test";
import { trace, isSpanContextValid } from "@opentelemetry/api";

// Disabled mode must not create a provider or try to use the invalid collector.
process.env.SKIP_ENV_VALIDATION = "true";
process.env.OTEL_ENABLED = "false";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "not-a-url";

void test("disabled tracing is a no-op, including queue metadata and shutdown", async () => {
  const { initTelemetry, shutdownTelemetry } = await import("./index");
  const { queueTelemetry } = await import("./queue");
  await initTelemetry("test");
  assert.equal(queueTelemetry(), undefined);
  const span = trace.getTracer("test").startSpan("disabled");
  assert.equal(isSpanContextValid(span.spanContext()), false);
  span.end();
  await shutdownTelemetry();
});
