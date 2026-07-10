/** Build main/preload (cjs, node) + renderer (browser) + salin aset statis. */
import { $ } from "bun";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
process.chdir(root);

const main = await Bun.build({
  entrypoints: ["src/main/main.ts"],
  target: "node",
  format: "cjs",
  external: ["electron"],
  naming: "main.cjs",
  outdir: "dist/main",
});
const preload = await Bun.build({
  entrypoints: ["src/preload/preload.ts"],
  target: "node",
  format: "cjs",
  external: ["electron"],
  naming: "preload.cjs",
  outdir: "dist/preload",
});
const renderer = await Bun.build({
  entrypoints: ["src/renderer/app.ts"],
  target: "browser",
  naming: "app.js",
  outdir: "dist/renderer",
});

for (const result of [main, preload, renderer]) {
  if (!result.success) {
    console.error(result.logs.join("\n"));
    process.exit(1);
  }
}

await $`cp src/renderer/index.html src/renderer/style.css dist/renderer/`;
await $`mkdir -p dist/assets && cp -R assets/icons dist/assets/`;
console.log("Build selesai → dist/");
