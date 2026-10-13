import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  privateEncrypt,
  sign,
  constants,
} from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const mobileRequire = createRequire(
  new URL("../../apps/mobile/package.json", import.meta.url),
);
function dependencyRequire(...chain) {
  let require = mobileRequire;
  for (const name of chain)
    require = createRequire(require.resolve(`${name}/package.json`));
  return require;
}

/** Verify the actual modules loaded by Expo, not an unused patch file in the repo. */
export function verifyDependencyPatches() {
  const cliRequire = dependencyRequire("expo", "@expo/cli");
  const forge = cliRequire("node-forge");
  const forgeVersion = cliRequire("node-forge/package.json").version;
  assert.equal(
    forgeVersion,
    "1.4.0",
    "Reassess forge mitigation after upgrading",
  );
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const verifier = forge.pki.publicKeyFromPem(
    publicKey.export({ type: "spki", format: "pem" }),
  );
  const message = Buffer.from("Harness dependency security regression");
  const digest = createHash("sha256").update(message).digest("latin1");
  assert.equal(
    verifier.verify(
      digest,
      sign("sha256", message, privateKey).toString("latin1"),
    ),
    true,
  );
  const { asn1 } = forge;
  const node = (type, constructed, value) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const malformed = node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.SEQUENCE, true, [
      node(
        asn1.Type.OID,
        false,
        asn1.oidToDer(forge.pki.oids.sha256).getBytes(),
      ),
      node(asn1.Type.NULL, false, ""),
      node(asn1.Type.OCTETSTRING, false, "unconsumed nested data"),
    ]),
    node(asn1.Type.OCTETSTRING, false, digest),
  ]);
  const malformedSignature = privateEncrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(asn1.toDer(malformed).getBytes(), "latin1"),
  );
  assert.throws(
    () => verifier.verify(digest, malformedSignature.toString("latin1")),
    /DigestInfo/,
  );

  const matcherRequire = dependencyRequire(
    "expo",
    "@expo/metro",
    "metro-file-map",
    "micromatch",
  );
  const braces = matcherRequire("braces");
  assert.equal(matcherRequire("braces/package.json").version, "3.0.3");
  assert.deepEqual(braces.expand("src/{api,workers}/*.ts"), [
    "src/api/*.ts",
    "src/workers/*.ts",
  ]);
  assert.deepEqual(braces.expand("{1..3}"), ["1", "2", "3"]);
  for (const [open, close] of [
    ["{", "}"],
    ["(", ")"],
  ]) {
    const hostile = open.repeat(4000) + "a,b" + close.repeat(4000);
    for (const method of ["parse", "compile", "expand", "stringify"]) {
      assert.throws(
        () => braces[method](hostile),
        /maximum nesting depth/,
        `${method} must reject deep input`,
      );
    }
  }
  // Lockfile must install these patches on fresh CI/Docker installs as well.
  const lock = readFileSync(
    new URL("../../pnpm-lock.yaml", import.meta.url),
    "utf8",
  );
  assert.match(lock, /patchedDependencies:/);
  for (const name of ["node-forge@1.4.0", "braces@3.0.3"])
    assert(lock.includes(`path: patches/${name}.patch`));
}
