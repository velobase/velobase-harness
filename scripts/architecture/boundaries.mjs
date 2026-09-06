import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const neutral = ["@velobase/contracts", "@velobase/api-client"];
const allowed = {
  "packages/contracts": ["zod"],
  "packages/api-client": ["@velobase/contracts"],
  "apps/mobile": [
    ...neutral,
    "react",
    "react-native",
    "expo",
    "expo-constants",
    "react-native-safe-area-context",
    "zod",
  ],
  "apps/desktop": [...neutral, "electron", "zod"],
};
const ignored = new Set([
  "node_modules",
  "dist",
  "out",
  ".expo",
  ".next",
  "android",
  "ios",
]);

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}

function imports(source) {
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      found.push(node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    )
      found.push(node.moduleReference.expression);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      found.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((node) =>
    node && ts.isStringLiteralLike(node) ? node.text : null,
  );
}

export function checkSource(file, code) {
  const owner = Object.keys(allowed).find((candidate) =>
    file.startsWith(`${candidate}/`),
  );
  if (!owner) return [];
  const errors = [];
  const renderer = file.startsWith("apps/desktop/src/renderer/");
  const main = file.startsWith("apps/desktop/src/main/");
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  for (const specifier of imports(source)) {
    let valid = false;
    if (specifier?.startsWith(".")) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier),
      );
      valid = target.startsWith(`${owner}/`);
      if (renderer)
        valid =
          target.startsWith("apps/desktop/src/renderer/") ||
          target === "apps/desktop/src/bridge";
      if (file.startsWith("apps/desktop/src/preload/"))
        valid =
          target.startsWith("apps/desktop/src/preload/") ||
          target === "apps/desktop/src/bridge";
    } else if (specifier) {
      valid = allowed[owner].some(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      );
      if (specifier.startsWith("node:") && main) valid = true;
      if (file === "apps/mobile/app.config.ts" && specifier === "tsx/cjs")
        valid = true;
      if (renderer && specifier === "electron") valid = false;
    }
    if (
      file === "apps/desktop/src/bridge.ts" &&
      specifier !== "@velobase/contracts"
    )
      valid = false;
    if (!valid)
      errors.push(`${file}: forbidden import ${specifier ?? "<computed>"}`);
  }
  // Build configuration may read an explicit public allowlist; app bundles may not read server env.
  const envOwner =
    file === "apps/desktop/src/main/env.ts" ||
    file === "apps/mobile/app.config.ts";
  const globals = new Set();
  function visit(node) {
    if (ts.isIdentifier(node)) globals.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!envOwner && globals.has("process"))
    errors.push(
      `${file}: process access outside platform environment boundary`,
    );
  if (
    owner.startsWith("packages/") &&
    ["window", "document", "localStorage", "fetch", "XMLHttpRequest"].some(
      (name) => globals.has(name),
    )
  )
    errors.push(`${file}: platform global in neutral package`);
  return errors;
}

export function checkBoundaries() {
  const errors = [];
  for (const [owner, dependencies] of Object.entries(allowed)) {
    const manifest = path.join(root, owner, "package.json");
    if (!existsSync(manifest)) {
      errors.push(`${owner}: missing manifest`);
      continue;
    }
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      if (!dependencies.includes(dependency))
        errors.push(`${owner}: forbidden dependency ${dependency}`);
      if (
        dependency.startsWith("@velobase/") &&
        pkg.dependencies[dependency] !== "workspace:*"
      )
        errors.push(`${owner}: workspace dependency must use workspace:*`);
    }
    for (const file of files(path.join(root, owner))) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (
        !/\.(ts|tsx|js|mjs|cjs)$/.test(file) ||
        /(?:\.test\.|\/tests\/|\/scripts\/)/.test(file)
      )
        continue;
      // Tooling configs run in Node, not in application bundles.
      if (relative === "apps/mobile/metro.config.js") continue;
      errors.push(...checkSource(relative, readFileSync(file, "utf8")));
    }
  }
  // Resolve the complete local API/Worker import graph, including legacy @/ aliases.
  const options = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root,
    paths: { "@/*": ["src/*"] },
    allowJs: true,
  };
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const specifier of imports(source)) {
      if (!specifier) continue;
      if (/^(next(?:\/|$)|next-auth(?:\/|$))/.test(specifier))
        errors.push(
          `${path.relative(root, file)}: backend imports ${specifier}`,
        );
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys)
        .resolvedModule?.resolvedFileName;
      if (
        resolved &&
        resolved.startsWith(root) &&
        !resolved.includes("/node_modules/")
      )
        visit(resolved);
    }
  }
  for (const service of ["api", "worker"]) {
    const entry = path.join(root, "services", service, "src/index.ts");
    if (!existsSync(entry)) errors.push(`services/${service}: missing entry`);
    else visit(entry);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkBoundaries();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
