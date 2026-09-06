import { build } from "esbuild";
import { mkdir, rm, copyFile, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/renderer", { recursive: true });
for (const [entry, outfile, platform] of [
  ["src/main/index.ts", "dist/main.cjs", "node"],
  ["src/preload/index.ts", "dist/preload.cjs", "node"],
  ["src/renderer/index.ts", "dist/renderer/index.js", "browser"],
]) {
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform,
    format: platform === "node" ? "cjs" : "iife",
    external: platform === "node" ? ["electron"] : [],
    metafile: true,
  });
  // Inspect what actually ships, in addition to source import boundary tests.
  if (
    Object.keys(result.metafile.inputs).some((input) =>
      /(?:^|\/)src\/(?:server|env|api|workers)\b|@prisma|next-auth/.test(input),
    )
  )
    throw new Error("Server code leaked into Desktop");
  await writeFile(`${outfile}.meta.json`, JSON.stringify(result.metafile));
}
for (const file of ["index.html", "style.css"])
  await copyFile(`src/renderer/${file}`, `dist/renderer/${file}`);
await writeFile(
  "dist/package.json",
  JSON.stringify({
    name: "velobase-desktop",
    version: "0.1.0",
    main: "main.cjs",
    private: true,
  }),
);
