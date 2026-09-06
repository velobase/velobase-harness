import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const cli = require.resolve("expo/bin/cli");

function expo(args: string[], overrides: Record<string, string | undefined>) {
  // Do not inherit tsx or Node's native TS stripping: Expo must load its own config.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CI: "1",
    EXPO_OFFLINE: "1",
    EXPO_NO_DOTENV: "1",
    EXPO_NO_TELEMETRY: "1",
    AUTH_SECRET: "never-export-secret",
    VELOBASE_MOBILE_API_ORIGIN: "https://example.com",
    ...overrides,
  };
  const flags =
    Number(process.versions.node.split(".")[0]) >= 22
      ? ["--no-experimental-strip-types"]
      : [];
  const result = spawnSync(process.execPath, [...flags, cli, ...args], {
    cwd: new URL("../", import.meta.url),
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

void test("Expo loads public config without native Node TypeScript support", () => {
  const result = expo(["config", "--type", "public", "--json"], {});
  assert.equal(result.status, 0, result.output);
  const config = JSON.parse(result.stdout) as {
    platforms: string[];
    extra: unknown;
  };
  assert.deepEqual(config.platforms, ["android", "ios"]);
  assert.deepEqual(config.extra, { apiOrigin: "https://example.com" });
  assert.doesNotMatch(result.output, /never-export-secret/);
});

void test("Expo dependency check executes the real dynamic config path", () => {
  const result = expo(["install", "--check"], {});
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Dependencies are up to date/);
});

void test("Expo reports safe actionable validation errors for missing or invalid environment", () => {
  for (const overrides of [
    { VELOBASE_MOBILE_API_ORIGIN: undefined },
    { VELOBASE_MOBILE_API_ORIGIN: "invalid-private-value" },
    { VELOBASE_MOBILE_ENV: "invalid-private-value" },
    {
      VELOBASE_MOBILE_API_ORIGIN:
        "https://user:invalid-private-value@example.com",
    },
    { VELOBASE_MOBILE_API_ORIGIN: "http://example.com" },
  ]) {
    const result = expo(["install", "--check"], overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /VELOBASE_MOBILE_(API_ORIGIN|ENV)/);
    assert.doesNotMatch(
      result.output,
      /only a getter|invalid-private-value|never-export-secret/,
    );
  }
});
