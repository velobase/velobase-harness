import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "@velobase/api-client";
import { createApiApp } from "../../../src/api/app";

void test("optional Hono health serves the shared contract at its existing path", async () => {
  const app = createApiApp();
  const client = createApiClient(
    async (path) => {
      const response = await app.request(path);
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    { healthPath: "/health" },
  );
  assert.equal((await client.getHealth()).status, "ok");
  assert.equal((await app.request("/missing")).status, 404);
});
