import assert from "node:assert/strict";
import test from "node:test";
import { blockingAdvisories } from "./audit.mjs";
import { verifyDependencyPatches } from "./dependency-patches.mjs";

const finding = {
  github_advisory_id: "GHSA-86w9-cpqp-85rv",
  severity: "high",
  module_name: "node-forge",
  findings: [
    { version: "1.4.0", paths: ["apps__mobile>expo>@expo/cli>node-forge"] },
  ],
};
const report = (advisory) => ({
  metadata: { vulnerabilities: { high: 1 } },
  advisories: { 1: advisory },
});

test(
  "security patches reject malformed signatures and deeply nested patterns",
  verifyDependencyPatches,
);
test("audit only accepts verified patched versions on the reviewed Expo path", () => {
  assert.deepEqual(blockingAdvisories(report(finding), true), []);
  assert.equal(blockingAdvisories(report(finding), false).length, 1);
  for (const changed of [
    { ...finding, github_advisory_id: "NEW-ADVISORY" },
    {
      ...finding,
      findings: [{ version: "1.4.1", paths: finding.findings[0].paths }],
    },
    { ...finding, findings: [{ version: "1.4.0", paths: [".>node-forge"] }] },
    { ...finding, findings: [] },
  ])
    assert.equal(blockingAdvisories(report(changed), true).length, 1);
  assert.throws(() =>
    blockingAdvisories({ error: "registry unavailable" }, true),
  );
});
