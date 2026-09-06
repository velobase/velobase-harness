export function createWebPreferences(preload: string) {
  if (!preload) throw new Error("Preload path is required");
  return Object.freeze({
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
  } as const);
}

export function isTrustedSender(
  sender: { url: string } | null,
  mainFrame: { url: string },
  rendererUrl: string,
) {
  return sender === mainFrame && sender.url === rendererUrl;
}
