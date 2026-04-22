/**
 * Web (Next.js) Service Starter
 *
 * Provides `startWeb()` for the SERVICE_MODE=all combined process.
 *
 * Next.js standalone mode does NOT support the programmatic `next()` API.
 * Instead, we fork `server.js` as a child process and monitor it.
 */
import { createLogger } from "@/lib/logger";
import { fork, type ChildProcess } from "child_process";
import path from "path";
import http from "http";

const log = createLogger("web");

const DEFAULT_WEB_PORT = 3000;

export interface WebHandle {
  shutdown: () => Promise<void>;
}

export async function startWeb(): Promise<WebHandle> {
  const port = parseInt(process.env.PORT ?? String(DEFAULT_WEB_PORT), 10);
  const hostname = process.env.WEB_HOST ?? "0.0.0.0";

  const serverJs = path.resolve(process.cwd(), "server.js");

  const child: ChildProcess = fork(serverJs, {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
    },
    stdio: "inherit",
  });

  child.on("error", (err) => {
    log.error({ error: err }, "Next.js child process error");
  });

  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      log.error({ code, signal }, "Next.js child process exited unexpectedly");
    }
  });

  await waitForPort(port, hostname, 60_000);
  log.info({ port, hostname }, `Next.js server listening on port ${port}`);

  const shutdown = () =>
    new Promise<void>((resolve) => {
      if (!child.connected && child.exitCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => {
        log.info("Next.js child process stopped");
        resolve();
      });
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
    });

  return { shutdown };
}

function waitForPort(port: number, host: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get({ host, port, path: "/healthz", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Next.js did not start within ${timeoutMs}ms`));
          return;
        }
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}
