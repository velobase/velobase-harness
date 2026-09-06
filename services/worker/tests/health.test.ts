import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../../src/workers/server";

void test("Worker HTTP health and readiness remain available without starting jobs", async () => {
  const server = await createServer();
  try {
    for (const path of ["/health", "/healthz", "/ready"]) {
      const response = await server.inject(path);
      assert.equal(response.statusCode, 200);
      const body = response.json<{ status: string }>();
      assert.equal(body.status, path === "/ready" ? "ready" : "ok");
    }
  } finally {
    await server.close();
  }
});
