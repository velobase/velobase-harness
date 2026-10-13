# CI dependency security maintenance

CI runs `pnpm test:security` and `pnpm audit:prod`. High/critical advisories still
fail the audit gate. The original registry counts remain visible. Registry or
report parsing failures also fail the job.

Most fixes use updated direct packages or version-bounded pnpm overrides. Expo
57 packages are aligned using `expo install --check`; do not disable that check.
Nodemailer 10 provides its own exported types; use named `SendMailOptions` rather
than the old default-import namespace.

## Local fixes awaiting upstream releases

The registry has no fixed release for these two advisories as of 2026-10-13:

- [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv):
  `node-forge@1.4.0`, used by Expo CLI. The pnpm patch backports the nested
  DigestAlgorithm element-count check from
  [upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152).
  A regression check signs a malformed DigestInfo using a local RSA key, asserts
  rejection, and also checks that a normal SHA-256 signature verifies.
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  `braces@3.0.3`, used by Expo Metro's micromatch. The local patch caps the parser
  stack at 128 entries before recursive downstream traversal. It bounds both
  braces and parentheses. Regression checks cover deep string input through
  parse/compile/expand/stringify plus normal glob expansion. Manually constructed
  ASTs are trusted library inputs and are outside this input-string mitigation.

`pnpm audit` cannot infer patched source from a version number, so it still
reports these versions. `scripts/security/audit.mjs` recognizes only the exact
advisory, module, version and reviewed Expo dependency path **after executing the
regression checks against the actual installed modules resolved through Expo**.
An unpatched install, new advisory, different version, new production path or
missing findings fails the gate. There is no global GHSA ignore list or severity
reduction. The patched packages can have other vulnerabilities; those are not
exempted.

Remove the corresponding patch and audit recognition together when upstream
ships a fixed version. Run `pnpm test:security`, `pnpm audit:prod`, Expo dependency
verification, native JS exports, and runtime checks afterward. Update the exact
reviewed dependency path if Expo restructures its dependency tree, after verifying
that the installed module remains patched.

Docker dependency-install stages and the isolated runtime smoke test copy
`patches/` alongside the pnpm manifest/lockfile. Frozen installs must include
these files; do not remove patches just to make a build pass.
