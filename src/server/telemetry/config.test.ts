import assert from "node:assert/strict";
import test from "node:test";
import { traceEndpoint, traceHeaders } from "./config";

void test("OTLP endpoint supports defaults, base paths and exact trace overrides", () => {
  assert.equal(traceEndpoint(), "http://localhost:4318/v1/traces");
  assert.equal(
    traceEndpoint("https://example.com/otel/"),
    "https://example.com/otel/v1/traces",
  );
  assert.equal(
    traceEndpoint("https://ignored.test", "https://collector.test/custom"),
    "https://collector.test/custom",
  );
  assert.throws(() => traceEndpoint("ftp://example.com"));
  assert.throws(() => traceEndpoint("https://secret:password@example.com"));
});

void test("OTLP auth headers decode values without accepting malformed or injected headers", () => {
  assert.deepEqual(traceHeaders(), {});
  assert.deepEqual(traceHeaders("Authorization=Bearer%20secret,x-key=a=b"), {
    Authorization: "Bearer secret",
    "x-key": "a=b",
  });
  for (const value of [
    "missing-equals",
    "=value",
    "auth=%GG",
    "auth=a%0D%0Ab",
    "bad key=value",
  ]) {
    assert.throws(() => traceHeaders(value));
  }
});
