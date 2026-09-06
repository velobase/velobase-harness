import { packager } from "@electron/packager";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
await packager({
  dir: "dist",
  out: "out",
  name: "Velobase",
  electronVersion: manifest.devDependencies.electron,
  overwrite: true,
  prune: false,
  asar: true,
  ignore: /\.meta\.json$/,
});
