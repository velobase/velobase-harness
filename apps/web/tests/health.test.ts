import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "@velobase/api-client";
import { GET } from "../src/health/route";

void test("Web health handler satisfies the same client used by the platform shells", async () => {
  const client = createApiClient(async () => {
    const response = GET();
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  });
  assert.equal((await client.getHealth()).status, "ok");
});
