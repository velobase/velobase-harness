import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createWebPreferences, isTrustedSender } from "../src/main/security";
import { resolveDesktopEnvironment } from "../src/main/env";

void test("locks the renderer and preload into isolated sandboxed contexts", () => {
  assert.deepEqual(createWebPreferences("/app/preload.cjs"), {
    preload: "/app/preload.cjs",
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
  });
  assert.throws(() => createWebPreferences(""));
});

void test("accepts IPC only from the shell's main frame and exact local URL", () => {
  const frame = { url: "file:///app/index.html" };
  assert.equal(isTrustedSender(frame, frame, frame.url), true);
  assert.equal(isTrustedSender({ ...frame }, frame, frame.url), false);
  assert.equal(isTrustedSender(frame, frame, "https://example.com"), false);
  assert.equal(isTrustedSender(null, frame, frame.url), false);
});

void test("rejects unsafe API origins and requires explicit production configuration", () => {
  assert.equal(
    resolveDesktopEnvironment({}, false).apiOrigin,
    "http://localhost:3000",
  );
  assert.throws(() => resolveDesktopEnvironment({}, true));
  for (const origin of [
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?key=secret",
    "http://example.com",
  ]) {
    assert.throws(() =>
      resolveDesktopEnvironment({ VELOBASE_DESKTOP_API_ORIGIN: origin }, true),
    );
  }
  assert.equal(
    resolveDesktopEnvironment(
      { VELOBASE_DESKTOP_API_ORIGIN: "https://example.com/" },
      true,
    ).apiOrigin,
    "https://example.com",
  );
});

void test("renderer CSP permits only bundled assets and no direct network", () => {
  const html = readFileSync(
    new URL("../src/renderer/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
