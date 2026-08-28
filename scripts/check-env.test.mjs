import assert from "node:assert/strict";
import test from "node:test";

import { checkEnvironmentDrift } from "./check-env.mjs";

const EMPTY_EXCEPTIONS = new Map();

function createEnvSource({
  schemaKeys = ["FOO"],
  runtimeKeys = schemaKeys,
} = {}) {
  const entries = (keys) => keys.map((key) => `    ${key}: value,`).join("\n");

  return `
  server: {
${entries(schemaKeys)}
  },
  client: {
  },
  /**
   * You can't destruct runtime values.
   */
  runtimeEnv: {
${entries(runtimeKeys)}
  },
  /**
   * Run \`build\` with validation.
   */
`;
}

function checkFixture({
  envSource = createEnvSource(),
  exampleSource = "FOO=value",
  exampleOnlyExceptions = EMPTY_EXCEPTIONS,
  schemaOnlyExceptions = EMPTY_EXCEPTIONS,
} = {}) {
  return checkEnvironmentDrift({
    envSource,
    exampleSource,
    sourceFiles: [],
    exampleOnlyExceptions,
    schemaOnlyExceptions,
    sourceOnlyExceptions: EMPTY_EXCEPTIONS,
    dynamicSourceExceptions: EMPTY_EXCEPTIONS,
  });
}

void test("rejects keys declared only in .env.example", () => {
  const result = checkFixture({
    exampleSource: "FOO=value\nEXAMPLE_ONLY=value",
  });

  assert.match(result.failures.join("\n"), /unexpected: EXAMPLE_ONLY/);
});

void test("rejects keys declared only in the schema", () => {
  const result = checkFixture({
    envSource: createEnvSource({ schemaKeys: ["FOO", "SCHEMA_ONLY"] }),
  });

  assert.match(result.failures.join("\n"), /missing: SCHEMA_ONLY/);
});

void test("rejects schema and runtimeEnv mismatches", () => {
  const result = checkFixture({
    envSource: createEnvSource({
      schemaKeys: ["FOO"],
      runtimeKeys: ["RUNTIME_ONLY"],
    }),
  });

  assert.match(result.failures.join("\n"), /schema and runtimeEnv differ/);
  assert.match(result.failures.join("\n"), /missing: FOO/);
  assert.match(result.failures.join("\n"), /unexpected: RUNTIME_ONLY/);
});

void test("rejects duplicate .env.example assignments", () => {
  const result = checkFixture({
    exampleSource: "FOO=first\n# FOO=second",
  });

  assert.match(result.failures.join("\n"), /duplicate assignment for FOO/);
});

void test("rejects malformed .env.example assignment lines", () => {
  const result = checkFixture({
    exampleSource: "FOO=value\nBROKEN KEY=value",
  });

  assert.match(result.failures.join("\n"), /malformed environment assignment/);
  assert.match(result.failures.join("\n"), /line 2/);
});

void test("accepts declared infrastructure exceptions", () => {
  const result = checkFixture({
    exampleSource: "FOO=value\nINFRA_ONLY=value",
    exampleOnlyExceptions: new Map([
      ["INFRA_ONLY", "consumed by deployment infrastructure"],
    ]),
  });

  assert.deepEqual(result.failures, []);
});
