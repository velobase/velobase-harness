import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { traceEndpoint, traceHeaders } from "./config";

export function startTelemetry(service: string): NodeTracerProvider {
  const exporter = new OTLPTraceExporter({
    url: traceEndpoint(
      env.OTEL_EXPORTER_OTLP_ENDPOINT,
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    ),
    headers: traceHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    timeoutMillis: 5000,
  });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      "service.name": env.OTEL_SERVICE_NAME ?? `velobase-harness-${service}`,
      "deployment.environment.name": env.NODE_ENV,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(env.OTEL_TRACES_SAMPLER_ARG ?? 1),
    }),
    spanProcessors: [
      new BatchSpanProcessor(exporter, { exportTimeoutMillis: 5000 }),
    ],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  // Diagnostic-channel instrumentation also works when fetch was loaded earlier.
  // Next already instruments fetch in request scopes; Undici supplies propagation
  // for API/Worker fetch and underlying network requests.
  const fetchInstrumentation = new UndiciInstrumentation({
    requireParentforSpans: true,
    requestHook(span, request) {
      // Never include URL queries (which may contain tokens) in these spans.
      const url = new URL(request.path, request.origin);
      url.search = "";
      url.username = "";
      url.password = "";
      span.setAttribute("url.query", "");
      url.hash = "";
      span.setAttribute("url.full", url.toString());
      span.setAttribute("http.url", url.toString());
    },
  });
  fetchInstrumentation.setTracerProvider(provider);
  createLogger("telemetry").info({ service }, "OpenTelemetry tracing enabled");
  return provider;
}
