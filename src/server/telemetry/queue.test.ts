import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Queue } from "bullmq";
import { trace } from "@opentelemetry/api";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.OTEL_ENABLED = "true";
process.env.OTEL_SERVICE_NAME = "harness-producer-test";

void test(
  "a queued job retains its producer trace in a separate Worker process",
  { timeout: 20000 },
  async (t) => {
    // Disposable local Redis only; never use the developer's configured database.
    const reservation = createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const addr = reservation.address();
    assert(addr && typeof addr !== "string");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const redisProcess = spawn(
      "redis-server",
      [
        "--bind",
        "127.0.0.1",
        "--port",
        String(addr.port),
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { stdio: "ignore" },
    );
    t.after(() => {
      redisProcess.kill("SIGTERM");
    });
    process.env.REDIS_URL = `redis://127.0.0.1:${addr.port}`;
    const resources: Array<{
      resource: {
        attributes: Array<{ key: string; value: { stringValue: string } }>;
      };
      scopeSpans: Array<{ spans: Array<{ traceId: string; name: string }> }>;
    }> = [];
    const collector = createHttpServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        resources.push(
          ...(JSON.parse(body) as { resourceSpans: typeof resources })
            .resourceSpans,
        );
        res.setHeader("content-type", "application/json");
        res.end("{}");
      });
    }).listen(0, "127.0.0.1");
    await once(collector, "listening");
    t.after(() => collector.close());
    const collectorAddr = collector.address();
    assert(collectorAddr && typeof collectorAddr !== "string");
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collectorAddr.port}`;
    const { redis } = await import("@/server/redis");
    t.after(() => redis.disconnect());
    await redis.ping();
    const { queueTelemetry } = await import("./queue");
    const { initTelemetry, shutdownTelemetry } = await import("./index");
    await initTelemetry("api");
    t.after(shutdownTelemetry);
    const queueName = `otel-test-${process.pid}`;
    const queue = new Queue(queueName, {
      connection: redis,
      telemetry: queueTelemetry(),
    });
    t.after(() => queue.close());
    const worker = fork(
      fileURLToPath(new URL("./fixtures/worker.ts", import.meta.url)),
      [queueName],
      {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, OTEL_SERVICE_NAME: "harness-worker-test" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let output = "";
    worker.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    worker.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    t.after(() => {
      worker.kill("SIGKILL");
    });
    const messages: Array<{ ready?: boolean; traceId?: string }> = [];
    worker.on("message", (message: { ready?: boolean; traceId?: string }) =>
      messages.push(message),
    );
    for (let i = 0; !messages.some((m) => m.ready) && i < 100; i++) {
      assert.equal(worker.exitCode, null, output);
      await delay(50);
    }
    assert(
      messages.some((m) => m.ready),
      output,
    );
    let traceId = "";
    await trace
      .getTracer("test")
      .startActiveSpan("api-enqueue", async (span) => {
        traceId = span.spanContext().traceId;
        try {
          await queue.add("process", { nonSensitiveFixture: true });
        } finally {
          span.end();
        }
      });
    for (let i = 0; !messages.some((m) => m.traceId) && i < 100; i++)
      await delay(50);
    assert.equal(messages.find((m) => m.traceId)?.traceId, traceId, output);
    const exit = once(worker, "exit");
    worker.kill("SIGTERM");
    assert.deepEqual(await exit, [0, null], output);
    await shutdownTelemetry();
    for (const service of ["harness-producer-test", "harness-worker-test"]) {
      assert(
        resources.some(
          (r) =>
            r.resource.attributes.some(
              (a) =>
                a.key === "service.name" && a.value.stringValue === service,
            ) &&
            r.scopeSpans.some((s) =>
              s.spans.some((span) => span.traceId === traceId),
            ),
        ),
        `Missing export from ${service}`,
      );
    }
  },
);
