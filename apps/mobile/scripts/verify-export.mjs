import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const metadata = JSON.parse(await readFile("dist/metadata.json", "utf8"));
for (const platform of ["android", "ios"]) {
  const bundle = metadata.fileMetadata[platform].bundle;
  assert.ok(
    (await stat(`dist/${bundle}`)).size > 0,
    `${platform}: empty bundle`,
  );
  const map = JSON.parse(await readFile(`dist/${bundle}.map`, "utf8"));
  const sources = map.sources.map((source) => source.replaceAll("\\", "/"));
  for (const name of ["contracts", "api-client"]) {
    assert.ok(
      sources.some((source) => source.includes(`packages/${name}/src/`)),
      `${platform}: missing shared ${name}`,
    );
  }
  const forbidden = sources.filter((source) =>
    /(?:^|\/)src\/(?:server|env\.js|workers|api\/)|apps\/(?:web|desktop)\/|@prisma|next-auth/.test(
      source,
    ),
  );
  assert.deepEqual(forbidden, [], `${platform}: server code in native bundle`);
}
