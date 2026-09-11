import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const authSecret = readFileSync(new URL("../../.harness-local/auth-secret", import.meta.url), "utf8").trim();
const child = spawn(process.execPath, ["--import", "tsx", "services/demo/seed-admin.ts"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://harness_demo:harness_demo@127.0.0.1:54333/harness_preview",
    AUTH_URL: "http://localhost:3003",
    APP_URL: "http://localhost:3003",
    AUTH_SECRET: authSecret,
    NEXT_PUBLIC_LOCAL_DEMO: "on",
    ADMIN_EMAIL: "demo@harness.local",
  },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
