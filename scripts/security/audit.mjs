import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { verifyDependencyPatches } from "./dependency-patches.mjs";

// Registry metadata cannot account for local pnpm patches. Only these exact
// findings/versions/Expo paths qualify, and only after regression verification.
const patchedFindings = new Map([
  [
    "GHSA-86w9-cpqp-85rv",
    {
      module: "node-forge",
      version: "1.4.0",
      path: "apps__mobile>expo>@expo/cli>node-forge",
    },
  ],
  [
    "GHSA-vfj7-8cjw-p6xm",
    {
      module: "braces",
      version: "3.0.3",
      path: "apps__mobile>expo>@expo/metro>metro-file-map>micromatch>braces",
    },
  ],
]);

export function blockingAdvisories(report, patchesVerified) {
  if (
    !report ||
    typeof report.advisories !== "object" ||
    !report.metadata?.vulnerabilities
  ) {
    throw new Error("Invalid audit report; refusing to pass security checks");
  }
  return Object.values(report.advisories).filter((advisory) => {
    if (!["high", "critical"].includes(advisory.severity)) return false;
    const patched =
      patchesVerified && patchedFindings.get(advisory.github_advisory_id);
    return !(
      patched &&
      advisory.module_name === patched.module &&
      advisory.findings?.length > 0 &&
      advisory.findings.every(
        (finding) =>
          finding.version === patched.version &&
          finding.paths?.length > 0 &&
          finding.paths.every((path) => path === patched.path),
      )
    );
  });
}

function main() {
  verifyDependencyPatches();
  const result = spawnSync("pnpm", ["audit", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.signal || ![0, 1].includes(result.status))
    throw new Error("Audit execution failed", { cause: result.error });
  const report = JSON.parse(result.stdout);
  const blocking = blockingAdvisories(report, true);
  // Keep the original findings visible, including the two patched registry reports.
  console.log(
    JSON.stringify(
      {
        vulnerabilities: report.metadata.vulnerabilities,
        verifiedPatches: [...patchedFindings.keys()],
        blocking: blocking.map((a) => ({
          id: a.github_advisory_id,
          module: a.module_name,
          severity: a.severity,
          findings: a.findings,
        })),
      },
      null,
      2,
    ),
  );
  if (blocking.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
