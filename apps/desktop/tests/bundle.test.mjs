import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const directory = fileURLToPath(new URL("../dist/", import.meta.url));

test("built main and sandboxed preload expose only validated health IPC", async () => {
  const handlers = new Map();
  const events = new Map();
  const requests = [];
  let window;
  let sandboxEnabled = false;
  let requestPermission;
  let checkPermission;
  const health = { status: "ok", timestamp: "2026-01-02T03:04:05.000Z" };
  const electron = {
    app: {
      enableSandbox() {
        sandboxEnabled = true;
      },
      whenReady: () => Promise.resolve(),
      on() {},
      isPackaged: false,
    },
    BrowserWindow: class {
      constructor(options) {
        this.options = options;
        this.webContents = {
          mainFrame: { url: "" },
          setWindowOpenHandler: (handler) => {
            this.open = handler;
          },
          on: (name, handler) => {
            events.set(name, handler);
          },
        };
        window = this;
      }
      on() {}
      loadFile(file) {
        this.webContents.mainFrame.url = new URL(`file://${file}`).href;
      }
    },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (handler) => {
          requestPermission = handler;
        },
        setPermissionCheckHandler: (handler) => {
          checkPermission = handler;
        },
      },
    },
  };
  vm.runInNewContext(readFileSync(`${directory}main.cjs`, "utf8"), {
    require: (name) => (name === "electron" ? electron : require(name)),
    __dirname: directory,
    process: { env: {} },
    URL,
    AbortSignal,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json(health);
    },
  });
  await Promise.resolve();
  assert.equal(sandboxEnabled, true);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.open().action, "deny");
  assert.equal(checkPermission(), false);
  requestPermission(null, "camera", (allowed) => assert.equal(allowed, false));
  for (const name of ["will-navigate", "will-attach-webview"]) {
    let prevented = false;
    events.get(name)({
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
  }
  assert.deepEqual([...handlers.keys()], ["velobase:health"]);
  const invoke = handlers.get("velobase:health");
  await assert.rejects(
    invoke({ sender: {}, senderFrame: null }),
    /Untrusted IPC/,
  );

  let bridge;
  vm.runInNewContext(readFileSync(`${directory}preload.cjs`, "utf8"), {
    require(name) {
      assert.equal(name, "electron"); // Sandboxed preload cannot require Node or workspace modules.
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, "velobase");
            bridge = value;
          },
        },
        ipcRenderer: {
          invoke: (channel) =>
            handlers.get(channel)({
              sender: window.webContents,
              senderFrame: window.webContents.mainFrame,
            }),
        },
      };
    },
  });
  assert.deepEqual(Object.keys(bridge), ["getHealth"]);
  assert.equal((await bridge.getHealth()).timestamp, health.timestamp);
  assert.equal(requests[0].url, "http://localhost:3000/api/health");
  assert.equal(requests[0].options.credentials, "omit");
  assert.equal(requests[0].options.redirect, "error");
});
