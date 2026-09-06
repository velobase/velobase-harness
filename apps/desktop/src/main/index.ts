import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { platform } from "node:os";
import { HEALTH_CHANNEL } from "../bridge";
import { createDesktopApi } from "./api";
import { getDesktopEnvironment } from "./env";
import { createWebPreferences, isTrustedSender } from "./security";

app.enableSandbox();

void app.whenReady().then(() => {
  const { apiOrigin } = getDesktopEnvironment(app.isPackaged);
  const api = createDesktopApi(apiOrigin);
  const rendererPath = path.join(__dirname, "renderer/index.html");
  const rendererUrl = pathToFileURL(rendererPath).href;
  let window: BrowserWindow | null = null;
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  ipcMain.handle(HEALTH_CHANNEL, async (event) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      !isTrustedSender(
        event.senderFrame,
        window.webContents.mainFrame,
        rendererUrl,
      )
    ) {
      throw new Error("Untrusted IPC sender");
    }
    return api.getHealth();
  });

  const createWindow = () => {
    window = new BrowserWindow({
      width: 760,
      height: 560,
      webPreferences: createWebPreferences(path.join(__dirname, "preload.cjs")),
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    window.on("closed", () => {
      window = null;
    });
    void window.loadFile(rendererPath);
  };
  createWindow();
  app.on("activate", () => {
    if (!window) createWindow();
  });
});

// Conventional macOS application lifecycle without exposing process to renderer.
app.on("window-all-closed", () => {
  if (platform() !== "darwin") app.quit();
});
