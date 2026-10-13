import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { trace } from "@opentelemetry/api";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.OTEL_ENABLED = "true";
process.env.OTEL_SERVICE_NAME = "harness-test";
process.env.OTEL_EXPORTER_OTLP_HEADERS = "x-test-token=local%20test";

interface ExportedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  status?: { code: number };
  attributes: Array<{
    key: string;
    value: { stringValue?: string; intValue?: number };
  }>;
}
interface ExportedResource {
  resource: {
    attributes: Array<{ key: string; value: { stringValue?: string } }>;
  };
  scopeSpans: Array<{ spans: ExportedSpan[] }>;
}

void test("HTTP propagation, errors, sampling and OTLP export work together", async (t) => {
  const exports: ExportedResource[] = [];
  const collector = createServer((req, res) => {
    assert.equal(req.url, "/custom/traces");
    assert.equal(req.headers["x-test-token"], "local test");
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body) as { resourceSpans: ExportedResource[] };
      exports.push(...payload.resourceSpans);
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
  }).listen(0, "127.0.0.1");
  await once(collector, "listening");
  t.after(() => collector.close());
  const address = collector.address();
  assert(address && typeof address !== "string");
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${address.port}/custom/traces`;
  const { initTelemetry, shutdownTelemetry } = await import("./index");
  await Promise.all([initTelemetry("api"), initTelemetry("api")]);
  t.after(shutdownTelemetry);
  const { traceApiRequest } = await import("./hono");
  const app = new Hono();
  app.use("*", traceApiRequest);
  app.get("/ok/:id", (c) => c.text("ok"));
  app.get("/failed", () => {
    throw new Error("private error");
  });
  app.onError((_error, c) => c.text("failed", 500));
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await once(server, "listening");
  t.after(() => server.close());
  const apiAddress = server.address();
  assert(apiAddress && typeof apiAddress !== "string");
  const origin = `http://127.0.0.1:${apiAddress.port}`;
  let rootTrace = "";
  await trace.getTracer("test").startActiveSpan("web-request", async (span) => {
    rootTrace = span.spanContext().traceId;
    try {
      await (await fetch(`${origin}/ok/123?token=secret`)).text();
    } finally {
      span.end();
    }
  });
  const remoteTrace = "1234567890abcdef1234567890abcdef";
  await app.request("/failed", {
    headers: { traceparent: `00-${remoteTrace}-1234567890abcdef-01` },
  });
  await app.request("/ok/456", {
    headers: {
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-00",
    },
  });
  await shutdownTelemetry();
  const spans = exports.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans));
  const root = spans.find((s) => s.name === "web-request");
  const api = spans.find((s) => s.name === "GET /ok/:id");
  assert(root && api);
  assert.equal(api.traceId, rootTrace);
  assert.notEqual(api.parentSpanId, root.spanId); // network client span sits between them
  assert(
    spans.some(
      (s) => s.spanId === api.parentSpanId && s.parentSpanId === root.spanId,
    ),
  );
  const failed = spans.find((s) => s.name === "GET /failed");
  assert.equal(failed?.traceId, remoteTrace);
  assert.equal(failed?.status?.code, 2);
  assert(!spans.some((s) => s.traceId === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  assert(!JSON.stringify(exports).includes("token=secret"));
  assert(
    exports.every((r) =>
      r.resource.attributes.some(
        (a) =>
          a.key === "service.name" && a.value.stringValue === "harness-test",
      ),
    ),
  );
  assert.equal(spans.filter((s) => s.name === "web-request").length, 1);
});
