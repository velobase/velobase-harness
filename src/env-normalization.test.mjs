import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthSecretSchema,
  normalizeAuthEnvironment,
  serviceModeSchema,
} from "./env-normalization.js";

void test("normalizes canonical Auth.js variables", () => {
  assert.deepEqual(
    normalizeAuthEnvironment({
      AUTH_SECRET: "canonical-secret",
      AUTH_URL: "https://auth.example.com",
    }),
    {
      authSecret: "canonical-secret",
      authUrl: "https://auth.example.com",
      appUrl: "https://auth.example.com",
    },
  );
});

void test("normalizes legacy NextAuth variables", () => {
  assert.deepEqual(
    normalizeAuthEnvironment({
      NEXTAUTH_SECRET: "legacy-secret",
      NEXTAUTH_URL: "https://legacy.example.com",
    }),
    {
      authSecret: "legacy-secret",
      authUrl: "https://legacy.example.com",
      appUrl: "https://legacy.example.com",
    },
  );
});

void test("prefers non-empty canonical Auth.js variables when aliases differ", () => {
  assert.deepEqual(
    normalizeAuthEnvironment({
      AUTH_SECRET: "canonical-secret",
      NEXTAUTH_SECRET: "legacy-secret",
      AUTH_URL: "https://auth.example.com",
      NEXTAUTH_URL: "https://legacy.example.com",
    }),
    {
      authSecret: "canonical-secret",
      authUrl: "https://auth.example.com",
      appUrl: "https://auth.example.com",
    },
  );
});

void test("uses valid legacy values when canonical Auth.js variables are empty", () => {
  assert.deepEqual(
    normalizeAuthEnvironment({
      AUTH_SECRET: "",
      NEXTAUTH_SECRET: "legacy-secret",
      AUTH_URL: "",
      NEXTAUTH_URL: "https://legacy.example.com",
    }),
    {
      authSecret: "legacy-secret",
      authUrl: "https://legacy.example.com",
      appUrl: "https://legacy.example.com",
    },
  );
});

void test("requires a resolved Auth.js secret in production", () => {
  const normalized = normalizeAuthEnvironment({});

  assert.equal(
    createAuthSecretSchema("production").safeParse(normalized.authSecret)
      .success,
    false,
  );
});

void test("lets APP_URL override Auth.js URLs and otherwise falls back", () => {
  assert.equal(
    normalizeAuthEnvironment({
      APP_URL: "https://app.example.com",
      AUTH_URL: "https://auth.example.com",
    }).appUrl,
    "https://app.example.com",
  );
  assert.equal(
    normalizeAuthEnvironment({ AUTH_URL: "https://auth.example.com" }).appUrl,
    "https://auth.example.com",
  );
  assert.equal(
    normalizeAuthEnvironment({
      NEXTAUTH_URL: "https://legacy.example.com",
    }).appUrl,
    "https://legacy.example.com",
  );
});

void test("accepts only documented SERVICE_MODE values and combinations", () => {
  const supported = [
    "web,worker",
    "all",
    "web",
    "api",
    "worker",
    "web,api",
    "web,api,worker",
  ];

  for (const serviceMode of supported) {
    assert.equal(serviceModeSchema.safeParse(serviceMode).success, true);
  }
  assert.equal(serviceModeSchema.safeParse("web,unknown").success, false);
});
