import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, createApiClient } from "./index";

const body = { status: "ok", timestamp: "2026-01-02T03:04:05.000Z" };

void test("requests the existing Web health path and validates the response", async () => {
  const paths: string[] = [];
  const client = createApiClient(async (path) => {
    paths.push(path);
    return { status: 200, body };
  });
  assert.deepEqual(await client.getHealth(), body);
  assert.deepEqual(paths, ["/api/health"]);
});

void test("supports the optional Hono service path", async () => {
  const client = createApiClient(
    async (path) => {
      assert.equal(path, "/health");
      return { status: 200, body };
    },
    { healthPath: "/health" },
  );
  await client.getHealth();
});

void test("classifies failures without exposing provider response bodies", async () => {
  for (const [status, response, kind] of [
    [503, { secret: "sensitive" }, "http"],
    [200, {}, "invalid_response"],
  ] as const) {
    await assert.rejects(
      createApiClient(async () => ({ status, body: response })).getHealth(),
      (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, kind);
        assert.doesNotMatch(error.message, /sensitive/);
        return true;
      },
    );
  }
  await assert.rejects(
    createApiClient(() => {
      throw new Error("secret URL");
    }).getHealth(),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "network");
      assert.doesNotMatch(error.message, /secret/);
      return true;
    },
  );
});
