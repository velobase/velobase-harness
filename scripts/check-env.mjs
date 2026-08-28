#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");

// Documented values that are intentionally consumed before application
// startup or implicitly by supporting libraries.
export const EXAMPLE_ONLY_EXCEPTIONS = new Map([
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
export const SCHEMA_ONLY_EXCEPTIONS = new Map([
  ["NODE_ENV", "set by Node.js and the deployment platform"],
]);

// Direct process.env reads outside the application schema must stay limited to
// framework internals and tooling/bootstrap entry points.
export const SOURCE_ONLY_EXCEPTIONS = new Map([
  ["ADMIN_EMAIL", "Prisma seed bootstrap setting"],
  ["NEXT_PHASE", "injected by Next.js"],
  ["NEXT_RUNTIME", "injected by Next.js"],
  ["SKIP_ENV_VALIDATION", "controls createEnv itself"],
  ["TEMPLATE_BUILD", "internal template-seed workflow switch"],
  ["VERCEL_URL", "injected by Vercel"],
]);

export const DYNAMIC_SOURCE_EXCEPTIONS = new Map([
  [
    "scripts/tests/integrations/ads/test-ads.ts",
    "integration test iterates over declared Google Ads variables",
  ],
]);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  "node_modules",
]);
const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function extractBlock(envSource, startMarker, endMarker) {
  const start = envSource.indexOf(startMarker);
  const end = envSource.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse src/env.js block: ${startMarker}`);
  }
  return envSource.slice(start, end);
}

function extractObjectKeys(block) {
  return new Set(
    [...block.matchAll(/^    ([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]),
  );
}

function extractSchemaKeys(envSource) {
  const serverKeys = extractObjectKeys(
    extractBlock(envSource, "  server: {", "\n  client: {"),
  );
  const clientKeys = extractObjectKeys(
    extractBlock(envSource, "  client: {", "\n  /**\n   * You can't destruct"),
  );
  const runtimeKeys = extractObjectKeys(
    extractBlock(envSource, "  runtimeEnv: {", "\n  /**\n   * Run `build`"),
  );

  return {
    schemaKeys: new Set([...serverKeys, ...clientKeys]),
    runtimeKeys,
  };
}

function extractExampleAssignments(exampleSource) {
  const exampleKeys = new Set();
  const firstAssignmentLines = new Map();
  const failures = [];

  for (const [index, line] of exampleSource.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const match = trimmed.startsWith("#")
      ? trimmed.match(/^#\s*([A-Z][A-Z0-9_]*)=(.*)$/)
      : trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);

    if (!match) {
      if (!trimmed.startsWith("#")) {
        failures.push(
          `.env.example line ${lineNumber}: malformed environment assignment ${JSON.stringify(trimmed)}; expected KEY=value (or # KEY=value for a documented optional value).`,
        );
      }
      continue;
    }

    const key = match[1];
    const firstLine = firstAssignmentLines.get(key);
    if (firstLine !== undefined) {
      failures.push(
        `.env.example line ${lineNumber}: duplicate assignment for ${key}; first assigned on line ${firstLine}. Remove one assignment so the documented value is unambiguous.`,
      );
      continue;
    }

    firstAssignmentLines.set(key, lineNumber);
    exampleKeys.add(key);
  }

  return { exampleKeys, failures };
}

function compareSets(failures, label, actual, expected) {
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const unexpected = [...actual].filter((key) => !expected.has(key)).sort();
  if (missing.length === 0 && unexpected.length === 0) return;

  failures.push(
    `${label}${missing.length > 0 ? `\n  missing: ${missing.join(", ")}` : ""}${
      unexpected.length > 0 ? `\n  unexpected: ${unexpected.join(", ")}` : ""
    }`,
  );
}

/**
 * @param {{
 *   envSource: string,
 *   exampleSource: string,
 *   sourceFiles?: Array<{ relativePath: string, source: string }>,
 *   exampleOnlyExceptions?: Map<string, string>,
 *   schemaOnlyExceptions?: Map<string, string>,
 *   sourceOnlyExceptions?: Map<string, string>,
 *   dynamicSourceExceptions?: Map<string, string>,
 * }} options
 */
export function checkEnvironmentDrift({
  envSource,
  exampleSource,
  sourceFiles = [],
  exampleOnlyExceptions = EXAMPLE_ONLY_EXCEPTIONS,
  schemaOnlyExceptions = SCHEMA_ONLY_EXCEPTIONS,
  sourceOnlyExceptions = SOURCE_ONLY_EXCEPTIONS,
  dynamicSourceExceptions = DYNAMIC_SOURCE_EXCEPTIONS,
}) {
  const { schemaKeys, runtimeKeys } = extractSchemaKeys(envSource);
  const { exampleKeys, failures: exampleAssignmentFailures } =
    extractExampleAssignments(exampleSource);
  const processEnvKeys = new Set();
  const envAccessorKeys = new Set();
  const dynamicProcessEnvFiles = new Set();

  for (const { relativePath, source } of sourceFiles) {
    for (const match of source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)) {
      processEnvKeys.add(match[1]);
    }
    for (const match of source.matchAll(
      /(?<!process\.)\benv\.([A-Z][A-Z0-9_]*)/g,
    )) {
      envAccessorKeys.add(match[1]);
    }
    if (/\bprocess\.env\s*\[[^\]]+\]/.test(source)) {
      dynamicProcessEnvFiles.add(relativePath);
    }
  }

  const expectedExampleKeys = new Set(
    [...schemaKeys].filter((key) => !schemaOnlyExceptions.has(key)),
  );
  for (const key of exampleOnlyExceptions.keys()) {
    expectedExampleKeys.add(key);
  }

  const sourceOnlyKeys = new Set(
    [...processEnvKeys].filter((key) => !schemaKeys.has(key)),
  );
  const unknownEnvAccessorKeys = new Set(
    [...envAccessorKeys].filter((key) => !schemaKeys.has(key)),
  );
  const failures = [...exampleAssignmentFailures];

  compareSets(
    failures,
    "schema and runtimeEnv differ",
    runtimeKeys,
    schemaKeys,
  );
  compareSets(
    failures,
    ".env.example and schema/declared exceptions differ",
    exampleKeys,
    expectedExampleKeys,
  );
  compareSets(
    failures,
    "process.env reads outside the schema differ from declared exceptions",
    sourceOnlyKeys,
    new Set(sourceOnlyExceptions.keys()),
  );
  compareSets(
    failures,
    "dynamic process.env reads differ from declared exceptions",
    dynamicProcessEnvFiles,
    new Set(dynamicSourceExceptions.keys()),
  );
  compareSets(
    failures,
    "env accessors reference undeclared schema keys",
    unknownEnvAccessorKeys,
    new Set(),
  );

  return {
    failures,
    schemaKeyCount: schemaKeys.size,
    exampleExceptionCount: exampleOnlyExceptions.size,
    sourceExceptionCount: sourceOnlyExceptions.size,
  };
}

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

export function runEnvironmentDriftCheck(root = defaultRoot) {
  const envSource = fs.readFileSync(path.join(root, "src/env.js"), "utf8");
  const exampleSource = fs.readFileSync(
    path.join(root, ".env.example"),
    "utf8",
  );
  const sourceFiles = collectSourceFiles(root).map((sourcePath) => ({
    relativePath: path.relative(root, sourcePath).split(path.sep).join("/"),
    source: fs.readFileSync(sourcePath, "utf8"),
  }));

  return checkEnvironmentDrift({ envSource, exampleSource, sourceFiles });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = runEnvironmentDriftCheck();
  if (result.failures.length > 0) {
    console.error(
      `Environment drift check failed:\n\n${result.failures.join("\n\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Environment drift check passed (${result.schemaKeyCount} schema keys, ${result.exampleExceptionCount} documented exceptions, ${result.sourceExceptionCount} source exceptions).`,
    );
  }
}
