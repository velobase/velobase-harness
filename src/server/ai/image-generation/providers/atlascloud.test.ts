import assert from "node:assert/strict";
import test from "node:test";
import { AtlasCloudProvider, resolveAtlasCloudSize } from "./atlascloud";

const config = {
  apiKey: "test-key",
  baseUrl: "https://api.atlascloud.test",
  timeoutMs: 1000,
};

void test("submits one Atlas Cloud text-to-image request", async (t) => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body;
      if (typeof body !== "string") throw new Error("Expected JSON body");
      requestBody = JSON.parse(body) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          code: 200,
          data: { id: "task-1", model: "test/model", status: "queued" },
        }),
        { status: 200 },
      );
    },
  );

  const prediction = await new AtlasCloudProvider(config).createPrediction({
    model: "test/model",
    operation: "text-to-image",
    prompt: "A paper-cut city",
    aspectRatio: "16:9",
    resolution: "4k",
    outputFormat: "jpeg",
  });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(requestBody, {
    model: "test/model",
    prompt: "A paper-cut city",
    size: "4096*2304",
    output_format: "jpeg",
    enable_base64_output: false,
  });
  assert.equal(prediction.providerTaskId, "task-1");
  assert.equal(prediction.status, "queued");
});

void test("does not retry an ambiguous generation failure", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("connection reset");
  });

  await assert.rejects(
    new AtlasCloudProvider(config).createPrediction({
      model: "test/model",
      operation: "text-to-image",
      prompt: "A lighthouse",
    }),
    /Atlas Cloud request failed/,
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

void test("rejects unsupported input before calling Atlas Cloud", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected request");
  });

  await assert.rejects(
    new AtlasCloudProvider(config).createPrediction({
      model: "test/model",
      operation: "image-to-image",
      prompt: "Restyle this image",
      imageUrls: ["https://example.com/input.png"],
    }),
    /text-to-image only/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

void test("normalizes completed prediction output", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            id: "task-2",
            model: "test/model",
            status: "completed",
            outputs: ["https://cdn.example.com/output.png", null],
          },
        }),
        { status: 200 },
      ),
  );

  const prediction = await new AtlasCloudProvider(config).getPrediction(
    "task-2",
  );
  assert.equal(prediction.status, "succeeded");
  assert.deepEqual(prediction.outputs, ["https://cdn.example.com/output.png"]);
});

void test("maps supported aspect ratios to live Atlas Cloud sizes", () => {
  assert.equal(resolveAtlasCloudSize("3:2", "2k"), "2496*1664");
  assert.equal(resolveAtlasCloudSize("9:16", "4k"), "2304*4096");
  assert.equal(resolveAtlasCloudSize("unknown", "1k"), "2048*2048");
});
