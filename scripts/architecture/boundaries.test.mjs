import assert from "node:assert/strict";
import test from "node:test";
import { checkBoundaries, checkSource } from "./boundaries.mjs";

test("tsx is restricted to Expo build config, never native application code", () => {
  assert.deepEqual(
    checkSource("apps/mobile/app.config.ts", 'import "tsx/cjs";'),
    [],
  );
  for (const file of [
    "apps/mobile/App.tsx",
    "apps/mobile/src/env.ts",
    "apps/desktop/src/renderer/index.ts",
    "apps/desktop/src/preload/index.ts",
  ]) {
    assert.ok(checkSource(file, 'import "tsx/cjs";').length);
  }
});

test("workspace sources and manifests respect dependency direction", () => {
  assert.deepEqual(checkBoundaries(), []);
});

test("rejects imports, re-exports, require and dynamic imports across platform boundaries", () => {
  for (const code of [
    'import x from "@/server/db";',
    'export * from "../../../src/env.js";',
    'const x = require("node:fs");',
    'const x = import("next/headers");',
    'import x from "@velobase/desktop";',
    "const x = import(variable);",
  ])
    assert.ok(
      checkSource("packages/api-client/src/example.ts", code).length,
      code,
    );
  assert.ok(
    checkSource(
      "apps/desktop/src/renderer/example.ts",
      'import { ipcRenderer } from "electron";',
    ).length,
  );
  assert.ok(
    checkSource(
      "apps/mobile/src/example.ts",
      "const x = process.env.AUTH_SECRET;",
    ).length,
  );
  assert.deepEqual(
    checkSource(
      "packages/api-client/src/example.ts",
      'import { healthResponseSchema } from "@velobase/contracts";',
    ),
    [],
  );
});

test("bridge contracts and Mobile build config cannot bypass platform direction", () => {
  assert.ok(
    checkSource("apps/desktop/src/bridge.ts", 'export * from "./main/api";')
      .length,
  );
  assert.ok(
    checkSource(
      "apps/mobile/config.ts",
      'import { env } from "../../src/env.js";',
    ).length,
  );
  assert.deepEqual(
    checkSource(
      "packages/contracts/src/example.ts",
      "// The host supplies fetch and process.env.\nexport const version = 1;",
    ),
    [],
  );
});
