import assert from "node:assert/strict";
import test from "node:test";
import { createHealthResponse, healthResponseSchema } from "./index";

void test("preserves the existing health wire format", () => {
  const now = new Date("2026-01-02T03:04:05.000Z");
  assert.deepEqual(createHealthResponse(now), {
    status: "ok",
    timestamp: now.toISOString(),
  });
  assert.equal(
    healthResponseSchema.safeParse(createHealthResponse(now)).success,
    true,
  );
});

void test("rejects invalid health responses and tolerates additive fields", () => {
  for (const body of [
    null,
    {},
    { status: "ready", timestamp: "today" },
    { status: "ok", timestamp: "invalid" },
  ]) {
    assert.equal(healthResponseSchema.safeParse(body).success, false);
  }
  const health = createHealthResponse(new Date("2026-01-02T03:04:05.000Z"));
  assert.deepEqual(
    healthResponseSchema.parse({ ...health, future: true }),
    health,
  );
});
