import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("server images install the locked backend closure and retain compatibility entries", () => {
  for (const file of ["Dockerfile", "Dockerfile.api", "Dockerfile.worker"]) {
    const source = read(file);
    assert.match(
      source,
      /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml/,
    );
    assert.match(source, /COPY packages \.\/packages/);
    assert.match(
      source,
      /--filter velobase-harness\.\.\. install --frozen-lockfile/,
    );
    assert.doesNotMatch(source, /pnpm add/);
    assert.match(source, /COPY .*services \.\/services/);
  }
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies.tsx);
  assert.ok(pkg.dependencies.prisma);
  assert.match(read("Dockerfile.web"), /COPY \.next\/standalone \.\//);
  assert.match(read("Dockerfile.web"), /COPY apps\/web\/next.config.js/);
});

test("Docker context excludes native outputs without stripping standalone dependencies", () => {
  const patterns = read(".dockerignore").split(/\r?\n/);
  for (const pattern of [
    "apps/**/node_modules",
    "apps/*/dist",
    "apps/*/out",
    "apps/mobile/.expo",
  ])
    assert.ok(patterns.includes(pattern));
  for (const pattern of [
    "**/node_modules",
    "**/dist",
    ".next",
    ".next/standalone",
  ])
    assert.ok(!patterns.includes(pattern), `would break Web image: ${pattern}`);
});
