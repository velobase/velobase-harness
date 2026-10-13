# OpenTelemetry tracing

Harness can export server traces from Next.js Web, the optional Hono API, and
BullMQ Worker processes to any OTLP/HTTP JSON receiver. It is disabled by default.
This is runtime infrastructure, separate from PostHog product analytics; it does
not enable the API service or any business module.

## Configuration

```dotenv
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_SAMPLER_ARG=1
# Optional: override the default name for this process/deployment
# OTEL_SERVICE_NAME=my-product-web
# Optional: exact URL, takes precedence over the base endpoint
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://collector.example.com/v1/traces
# Optional: comma-separated header names and percent-encoded values
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20token
```

All settings are server-only and validated through `src/env.js`. Restart after
changing them. `OTEL_ENABLED=false` skips SDK initialization and BullMQ telemetry.
An enabled deployment with invalid endpoint/header configuration fails startup.
The exporter uses **OTLP HTTP/JSON**, not gRPC (4317) or HTTP/protobuf. It appends
`/v1/traces` to the base URL; the trace-specific URL is used exactly. The default
base is `http://localhost:4318`. In containers, use a reachable collector hostname,
not localhost unless the collector runs in the same network namespace.

Sampling is parent-based: remote sampled/unsampled decisions are respected; the
probability for new root traces is `OTEL_TRACES_SAMPLER_ARG` (0–1, default 1).
No metrics or log exporter is enabled. The Collector must accept HTTP/JSON on its
OTLP HTTP receiver. Export happens in batches with a 5-second export timeout;
collector failure does not fail application requests.

## Coverage and service names

- **Web:** `src/instrumentation.ts` registers the Node provider before runtime
  modules. Next.js emits its built-in server request/render/fetch spans. Edge
  runtime and browser RUM are not instrumented.
- **API:** `startApi()` initializes the provider. Hono middleware extracts W3C
  `traceparent`/`tracestate`, records method, route template and response status,
  and marks 5xx/errors. It does not record request bodies or headers.
- **Worker:** `startWorker()` initializes the provider. Every framework queue and
  the example queue attaches `queueTelemetry()`, as does `createWorkerInstance()`.
  BullMQ stores trace metadata in job options and restores it when processing,
  including execution in another process. Existing jobs without metadata create
  new traces. Scheduled jobs do not necessarily have a originating request.
- **Outbound fetch:** Undici instrumentation propagates active W3C context from
  Web/API/Worker native fetch calls. Queries and credentials are removed from
  its URL attributes. Raw `http`, Axios, Prisma and Redis commands are not
  automatically instrumented by this integration. Next/BullMQ may emit their own
  attributes and exception details; apply Collector redaction before exporting
  to an external backend where necessary.

Default names are `velobase-harness-web`, `velobase-harness-api`, and
`velobase-harness-worker`. The combined launcher uses one provider for its
API/Worker process (e.g. `velobase-harness-api-worker`); its Web child has a separate
provider named `velobase-harness-web`. `OTEL_SERVICE_NAME` overrides the name;
using the same override in multiple processes intentionally groups them together.
Initialization is idempotent, including concurrent calls and Next bundle reloads.

API/Worker/combined launchers await exporter shutdown after draining services.
Next owns the Web process lifecycle; Web starts a best-effort export on signals
and before exit. Abrupt process termination or a platform-imposed timeout can
lose buffered spans. This integration does not replace Next's signal handlers.

## Adding a queue or custom span

Add `telemetry: queueTelemetry()` to new Queue options (import from
`@/server/telemetry/queue`), and create workers through `createWorkerInstance()`.
Do not put trace metadata into business job data or copy it by hand. The existing
example queue demonstrates the configuration.

For business operations that need finer detail, use `trace` from
`@opentelemetry/api`, `startActiveSpan`, and `span.end()` in `finally`. These calls
are no-ops when the SDK is disabled. Do not put credentials, payloads, or personal
data into span attributes or names.

## Verification

```bash
pnpm test:telemetry
```

Tests cover disabled mode, endpoint/header parsing, HTTP context propagation,
5xx marking, unsampled remote parents, duplicate initialization, and local OTLP
export. The queue integration test requires `redis-server` on PATH and starts a
disposable instance plus a separate Worker process. It verifies shared trace IDs,
service identities and export at graceful shutdown; it never uses your database.

For a manual check, configure a Collector, start Web and Worker, and trigger a
flow that enqueues work. Search for the same trace ID under both service names.
For the optional API, enable `SERVICE_MODE=all` and call `/health` with a valid
W3C traceparent. Inspect Collector output for its API server span.

References: [OTel exporters](https://opentelemetry.io/docs/languages/js/exporters/),
[BullMQ telemetry](https://docs.bullmq.io/guide/telemetry/getting-started).
