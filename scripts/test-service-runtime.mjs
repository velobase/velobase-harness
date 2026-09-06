import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const images = process.argv.includes("--images");
const staging = await mkdtemp(path.join(tmpdir(), "velobase-runtime-"));
const children = [];
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME, CI: "1" };

function start(command, args, cwd = staging, env = cleanEnv) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { child, output: "", done: once(child, "exit") };
  children.push(state);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      state.output += data.toString();
    });
  return state;
}

function startImage(service, env, args = []) {
  return start("docker", [
    "run",
    "--rm",
    "--network",
    "host",
    ...Object.entries(env)
      .filter(([key]) => !["PATH", "HOME"].includes(key))
      .flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    `velobase-${service}-smoke`,
    ...args,
  ]);
}

async function run(command, args) {
  const state = start(command, args);
  const [code] = await state.done;
  assert.equal(code, 0, state.output);
}

async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const number = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return number;
}

async function until(predicate, state) {
  for (let attempt = 0; attempt < 300; attempt++) {
    assert.equal(state.child.exitCode, null, state.output);
    if (await predicate()) return;
    await delay(100);
  }
  assert.fail(`Runtime readiness timed out:\n${state.output}`);
}

async function stop(state) {
  state.child.kill("SIGTERM");
  const timeout = setTimeout(() => state.child.kill("SIGKILL"), 10_000);
  try {
    const [code, signal] = await state.done;
    assert.equal(signal, null, state.output);
    assert.equal(code, 0, state.output);
  } finally {
    clearTimeout(timeout);
  }
}

try {
  // Reproduce the API/Worker Docker install layer in isolation. No workspace
  // node_modules, development dependencies, or Desktop/Mobile manifests exist here.
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "packages",
    "prisma",
  ])
    await cp(path.join(root, file), path.join(staging, file), {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes("node_modules"),
    });
  await run("pnpm", [
    "--filter",
    "velobase-harness...",
    "install",
    "--frozen-lockfile",
    "--prod",
    "--ignore-scripts",
  ]);
  await run("pnpm", ["prisma", "generate"]);
  const installed = await readdir(path.join(staging, "node_modules/.pnpm"));
  assert.ok(
    !installed.some((name) =>
      /^(expo(?:-|@)|@expo\+|react-native@|electron@|@electron\+)/.test(name),
    ),
  );
  for (const file of [
    "src",
    "services",
    "tsconfig.json",
    "public/data/disposable-domains.txt",
  ])
    await cp(path.join(root, file), path.join(staging, file), {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes("node_modules"),
    });

  const redisPort = await port();
  const redis = start("redis-server", [
    "--bind",
    "127.0.0.1",
    "--port",
    String(redisPort),
    "--save",
    "",
    "--appendonly",
    "no",
  ]);
  await until(
    () => redis.output.includes("Ready to accept connections"),
    redis,
  );
  const catalog = await readFile(
    path.join(root, "src/server/modules/catalog.ts"),
    "utf8",
  );
  const disabledModules = Object.fromEntries(
    [...catalog.matchAll(/modeEnv: "(\w+)"/g)].map((match) => [
      match[1],
      "off",
    ]),
  );
  const env = {
    ...cleanEnv,
    ...disabledModules,
    NODE_ENV: "production",
    AUTH_SECRET: "runtime-smoke-local-secret-at-least-32-characters",
    DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/smoke",
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    DOTENV_CONFIG_PATH: path.join(staging, "absent.env"),
  };
  const require = createRequire(path.join(staging, "package.json"));
  const { Queue } = require("bullmq");

  // Exercise both the new launchers and the compatibility paths used by Docker.
  for (const [service, entries] of [
    ["api", ["services/api/src/index.ts", "src/api/index.ts"]],
    ["worker", ["services/worker/src/index.ts", "src/workers/index.ts"]],
  ]) {
    for (const entry of entries) {
      const servicePort = await port();
      const serviceEnv = {
        ...env,
        SERVICE_MODE: service,
        [`${service.toUpperCase()}_PORT`]: String(servicePort),
      };
      const state = images
        ? startImage(service, serviceEnv, ["node", "--import", "tsx", entry])
        : start(
            process.execPath,
            ["--import", "tsx", entry],
            staging,
            serviceEnv,
          );
      await until(
        () =>
          state.output.includes(
            service === "api" ? "API server listening" : "Worker ready",
          ),
        state,
      );
      const response = await fetch(`http://127.0.0.1:${servicePort}/health`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "ok");
      if (service === "worker") {
        const readiness = await fetch(`http://127.0.0.1:${servicePort}/ready`);
        assert.equal((await readiness.json()).status, "ready");
        const queue = new Queue("stale-job-cleanup", {
          connection: { host: "127.0.0.1", port: redisPort },
        });
        try {
          const job = await queue.add("runtime-smoke", {
            type: "scheduled-scan",
          });
          await until(
            async () => (await job.getState()) === "completed",
            state,
          );
          assert.match(state.output, /Stale job cleanup completed/);
        } finally {
          await queue.close();
        }
      }
      await stop(state);
      console.log(
        `PASS ${images ? "Docker image" : `Node ${process.versions.node} production install`}: ${entry}, HTTP health${service === "worker" ? ", Redis job completion" : ""}, SIGTERM`,
      );
    }
  }
  if (images) {
    const webPort = await port();
    const web = startImage("web", {
      ...env,
      PORT: String(webPort),
      HOSTNAME: "127.0.0.1",
      SKIP_MIGRATION: "true",
    });
    await until(() => web.output.includes("Ready in"), web);
    const response = await fetch(`http://127.0.0.1:${webPort}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
    await stop(web);
    console.log(
      "PASS Docker image: Web standalone entrypoint, HTTP health, SIGTERM (migrations skipped)",
    );
  }
  await stop(redis);
} finally {
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  await Promise.allSettled(children.map((state) => state.done));
  await rm(staging, { recursive: true, force: true });
}
