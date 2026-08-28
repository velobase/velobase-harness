#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "src/env.js");
const examplePath = path.join(root, ".env.example");

// Documented values that are intentionally consumed before application
// startup or implicitly by supporting libraries.
const EXAMPLE_ONLY_EXCEPTIONS = new Map([
  ["ADMIN_EMAIL", "Prisma seed bootstrap setting"],
  ["DEBUG", "conventional debug-library setting"],
  ["HTTP_PROXY", "conventional HTTP client proxy setting"],
  ["HTTPS_PROXY", "conventional HTTP client proxy setting"],
  ["MIGRATION_OPTIONAL", "Docker entrypoint setting"],
  ["SEED_OPTIONAL", "Docker entrypoint setting"],
  ["SKIP_ENV_VALIDATION", "createEnv bootstrap switch"],
  ["SKIP_MIGRATION", "Docker entrypoint setting"],
  ["SKIP_SEED", "Docker entrypoint setting"],
]);

// Runtime/framework values that should not be copied into a user .env file.
const SCHEMA_ONLY_EXCEPTIONS = new Map([
  ["NODE_ENV", "set by Node.js and the deployment platform"],
]);

// Direct process.env reads outside the application schema must stay limited to
// framework internals and tooling/bootstrap entry points.
const SOURCE_ONLY_EXCEPTIONS = new Map([
  ["ADMIN_EMAIL", "Prisma seed bootstrap setting"],
  ["NEXT_PHASE", "injected by Next.js"],
  ["NEXT_RUNTIME", "injected by Next.js"],
  ["SKIP_ENV_VALIDATION", "controls createEnv itself"],
  ["TEMPLATE_BUILD", "internal template-seed workflow switch"],
  ["VERCEL_URL", "injected by Vercel"],
]);

const DYNAMIC_SOURCE_EXCEPTIONS = new Map([
  [
    "scripts/tests/integrations/ads/test-ads.ts",
    "integration test iterates over declared Google Ads variables",
  ],
]);

const envSource = fs.readFileSync(envPath, "utf8");
const exampleSource = fs.readFileSync(examplePath, "utf8");

function extractBlock(startMarker, endMarker) {
  const start = envSource.indexOf(startMarker);
  const end = envSource.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse src/env.js block: ${startMarker}`);
  }
  return envSource.slice(start, end);
}

function extractObjectKeys(block) {
  return new Set(
    [...block.matchAll(/^    ([A-Z][A-Z0-9_]*):/gm)].map(
      (match) => match[1],
    ),
  );
}

const serverKeys = extractObjectKeys(
  extractBlock("  server: {", "\n  client: {"),
);
const clientKeys = extractObjectKeys(
  extractBlock("  client: {", "\n  /**\n   * You can't destruct"),
);
const schemaKeys = new Set([...serverKeys, ...clientKeys]);
const runtimeKeys = extractObjectKeys(
  extractBlock("  runtimeEnv: {", "\n  /**\n   * Run `build`"),
);

const exampleKeys = new Set();
for (const line of exampleSource.split("\n")) {
  const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
  if (match) exampleKeys.add(match[1]);
}

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  "node_modules",
]);
const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
}

const processEnvKeys = new Set();
const envAccessorKeys = new Set();
const dynamicProcessEnvFiles = new Set();

for (const sourcePath of collectSourceFiles(root)) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const relativePath = path.relative(root, sourcePath).split(path.sep).join("/");

  for (const match of source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)) {
    processEnvKeys.add(match[1]);
  }
  for (const match of source.matchAll(/(?<!process\.)\benv\.([A-Z][A-Z0-9_]*)/g)) {
    envAccessorKeys.add(match[1]);
  }
  if (/\bprocess\.env\s*\[[^\]]+\]/.test(source)) {
    dynamicProcessEnvFiles.add(relativePath);
  }
}

const expectedExampleKeys = new Set(
  [...schemaKeys].filter((key) => !SCHEMA_ONLY_EXCEPTIONS.has(key)),
);
for (const key of EXAMPLE_ONLY_EXCEPTIONS.keys()) {
  expectedExampleKeys.add(key);
}

const sourceOnlyKeys = new Set(
  [...processEnvKeys].filter((key) => !schemaKeys.has(key)),
);
const unknownEnvAccessorKeys = new Set(
  [...envAccessorKeys].filter((key) => !schemaKeys.has(key)),
);

const failures = [];

function compareSets(label, actual, expected) {
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const unexpected = [...actual].filter((key) => !expected.has(key)).sort();
  if (missing.length === 0 && unexpected.length === 0) return;

  failures.push(
    `${label}${
      missing.length > 0 ? `\n  missing: ${missing.join(", ")}` : ""
    }${
      unexpected.length > 0
        ? `\n  unexpected: ${unexpected.join(", ")}`
        : ""
    }`,
  );
}

compareSets("schema and runtimeEnv differ", runtimeKeys, schemaKeys);
compareSets(
  ".env.example and schema/declared exceptions differ",
  exampleKeys,
  expectedExampleKeys,
);
compareSets(
  "process.env reads outside the schema differ from declared exceptions",
  sourceOnlyKeys,
  new Set(SOURCE_ONLY_EXCEPTIONS.keys()),
);
compareSets(
  "dynamic process.env reads differ from declared exceptions",
  dynamicProcessEnvFiles,
  new Set(DYNAMIC_SOURCE_EXCEPTIONS.keys()),
);
compareSets(
  "env accessors reference undeclared schema keys",
  unknownEnvAccessorKeys,
  new Set(),
);

if (failures.length > 0) {
  console.error(`Environment drift check failed:\n\n${failures.join("\n\n")}\n`);
  process.exit(1);
}

console.log(
  `Environment drift check passed (${schemaKeys.size} schema keys, ${EXAMPLE_ONLY_EXCEPTIONS.size} documented exceptions, ${SOURCE_ONLY_EXCEPTIONS.size} source exceptions).`,
);
