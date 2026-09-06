import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi } from "../src/api";

void test("native adapter reaches the Web endpoint without browser cookies", async () => {
  const body = { status: "ok", timestamp: "2026-01-02T03:04:05.000Z" };
  const api = createMobileApi("https://example.com", async (url, init) => {
    assert.equal(url, "https://example.com/api/health");
    assert.equal(init?.credentials, "omit");
    assert.ok(init?.signal);
    return Response.json(body);
  });
  assert.deepEqual(await api.getHealth(), body);
});

void test("native network errors become safe retryable UI errors", async () => {
  const api = createMobileApi("https://example.com", async () => {
    throw new Error("private details");
  });
  await assert.rejects(api.getHealth(), {
    message: "API request failed: network",
  });
});
