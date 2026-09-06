import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createMobileConfig } from "../config";

void test("one Expo app declares both native platforms and publishes only public config", () => {
  const config = createMobileConfig({
    VELOBASE_MOBILE_API_ORIGIN: "https://example.com",
    AUTH_SECRET: "never-export",
    DATABASE_URL: "never-export",
  });
  assert.deepEqual(config.platforms, ["android", "ios"]);
  assert.equal(config.ios?.bundleIdentifier, "org.velobase.harness");
  assert.equal(config.android?.package, "org.velobase.harness");
  assert.deepEqual(config.extra, { apiOrigin: "https://example.com" });
  assert.doesNotMatch(JSON.stringify(config), /never-export/);
});

void test("requires an explicit origin and HTTPS for release builds", () => {
  assert.throws(() => createMobileConfig({}));
  assert.throws(() =>
    createMobileConfig({
      VELOBASE_MOBILE_API_ORIGIN: "http://192.168.1.2:3000",
    }),
  );
  assert.equal(
    createMobileConfig({
      VELOBASE_MOBILE_ENV: "development",
      VELOBASE_MOBILE_API_ORIGIN: "http://192.168.1.2:3000",
    }).extra?.apiOrigin,
    "http://192.168.1.2:3000",
  );
  for (const origin of [
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com#token",
  ]) {
    assert.throws(() =>
      createMobileConfig({ VELOBASE_MOBILE_API_ORIGIN: origin }),
    );
  }
});

void test("Mobile owns its native runtime and depends only on neutral workspace packages", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { main: string; dependencies: Record<string, string> };
  assert.equal(pkg.main, "index.ts");
  for (const name of [
    "expo",
    "react",
    "react-native",
    "@velobase/api-client",
    "@velobase/contracts",
  ])
    assert.ok(pkg.dependencies[name]);
  for (const name of [
    "next",
    "next-auth",
    "electron",
    "@prisma/client",
    "velobase-harness",
  ])
    assert.equal(pkg.dependencies[name], undefined);
});
