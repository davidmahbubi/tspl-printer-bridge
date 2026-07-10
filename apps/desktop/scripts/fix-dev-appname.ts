/**
 * In development, macOS shows "Electron" in the menu bar & dock because the
 * name comes from Electron.app's Info.plist in node_modules — not from
 * app.setName(). This script patches that plist and re-signs ad-hoc
 * (required on Apple Silicon after the bundle changes). Idempotent.
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const APP_NAME = "TSPL Print Bridge";

if (process.platform !== "darwin") process.exit(0);

const electronApp = join(
  import.meta.dir,
  "../../../node_modules/electron/dist/Electron.app"
);
const plist = join(electronApp, "Contents/Info.plist");

if (!existsSync(plist)) {
  console.error("Electron.app not found:", electronApp);
  process.exit(1);
}

const current = (
  await $`/usr/libexec/PlistBuddy -c "Print :CFBundleName" ${plist}`.text()
).trim();

if (current === APP_NAME) process.exit(0);

await $`/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" ${plist}`;
try {
  await $`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" ${plist}`.quiet();
} catch {
  await $`/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string ${APP_NAME}" ${plist}`.quiet();
}
await $`codesign --force --sign - ${electronApp}`.quiet();
console.log(`Dev app name set to "${APP_NAME}"`);
