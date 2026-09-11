import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const native = process.argv.includes("--local");
const demoStateDirectory = native
  ? path.resolve(".harness-local")
  : "/var/lib/harness-demo";
mkdirSync(demoStateDirectory, { recursive: true, mode: 0o700 });

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

if (native) {
  const compose = [
    "compose",
    "-f",
    "compose.demo.yml",
    "-f",
    "compose.local.yml",
  ];
  const containerId = (service, running = false) =>
    command(
      "docker",
      [
        ...compose,
        "ps",
        "-q",
        ...(running ? ["--status", "running"] : ["--all"]),
        service,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).stdout.trim();
  const previousWeb = containerId("web");

  // Preserve the existing local login and seed marker when leaving Docker Web.
  if (previousWeb) {
    for (const file of ["auth-secret", "harness-preview-seeded"]) {
      const destination = path.join(demoStateDirectory, file);
      if (!existsSync(destination)) {
        command("docker", [
          "cp",
          `${previousWeb}:/var/lib/harness-demo/${file}`,
          destination,
        ]);
      }
    }
    command("docker", [...compose, "stop", "web"]);
  }
  // Persist Redis before Compose adds host ports. Compose retains its /data volume.
  if (containerId("redis", true)) {
    command("docker", [...compose, "exec", "-T", "redis", "redis-cli", "SAVE"]);
  }
  command("docker", [...compose, "up", "-d", "--wait", "postgres", "redis"]);
  Object.assign(process.env, {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
    DATABASE_URL:
      "postgresql://harness_demo:harness_demo@127.0.0.1:54333/harness_preview",
    REDIS_URL: "redis://127.0.0.1:56380/0",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "56380",
    AUTH_URL: "http://localhost:3003",
    APP_URL: "http://localhost:3003",
    NEXT_PUBLIC_LOCAL_DEMO: "on",
    ADMIN_EMAIL: "demo@harness.local",
    PORT: "3003",
    WEB_HOST: "127.0.0.1",
    SERVICE_MODE: "web,worker",
  });
}

// Both launch modes use only the isolated local Harness preview database.
if (
  process.env.NEXT_PUBLIC_LOCAL_DEMO !== "on" ||
  process.env.NODE_ENV !== "development" ||
  process.env.AUTH_URL !== "http://localhost:3003" ||
  process.env.ADMIN_EMAIL !== "demo@harness.local" ||
  process.env.DATABASE_URL !==
    (native
      ? "postgresql://harness_demo:harness_demo@127.0.0.1:54333/harness_preview"
      : "postgresql://harness_demo:harness_demo@postgres:5432/harness_preview")
) {
  throw new Error(
    "Use pnpm dev:local or compose.demo.yml to start the local Harness experience.",
  );
}

const secretPath = `${demoStateDirectory}/auth-secret`;
let authSecret;
try {
  authSecret = readFileSync(secretPath, "utf8").trim();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  authSecret = randomBytes(32).toString("hex");
  writeFileSync(secretPath, authSecret, { mode: 0o600, flag: "wx" });
}
const demoEnvironment = { ...process.env, AUTH_SECRET: authSecret };
function run(args) {
  command("pnpm", args, { env: demoEnvironment });
}

// Native development needs the generated Prisma client for this machine.
if (native) run(["exec", "prisma", "generate"]);
// The original schema is applied only to this isolated local preview database.
// No reset or accept-data-loss flag: incompatible existing data fails visibly.
run(["exec", "prisma", "db", "push", "--skip-generate"]);
const seededPath = `${demoStateDirectory}/harness-preview-seeded`;
if (!existsSync(seededPath)) {
  run(["exec", "tsx", "services/demo/seed.ts"]);
  run(["db:seed"]);
  writeFileSync(seededPath, "1", { mode: 0o600 });
}

const adminSeededPath = `${demoStateDirectory}/harness-admin-demo-v1`;
if (!existsSync(adminSeededPath)) {
  run(["exec", "tsx", "services/demo/seed-admin.ts"]);
  writeFileSync(adminSeededPath, "1", { mode: 0o600 });
}

console.log(
  `\nOpen http://localhost:3003. In Sign in, choose Explore as local administrator.${native ? "\nWeb and Worker run on this machine. Source edits refresh the browser automatically." : ""}\n`,
);
const web = spawn("pnpm", ["dev:all"], {
  stdio: "inherit",
  env: demoEnvironment,
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => web.kill(signal));
}
web.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
web.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
