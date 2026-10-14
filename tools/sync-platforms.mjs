// Copies the web app (root files = the only source of truth) into the Android and Windows projects.
// CI runs this before every build; the copies are git-ignored, so they can never drift.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const files = ["index.html", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
const targets = ["android/app/src/main/assets", "desktop/Web"];

for (const dir of targets) {
  mkdirSync(resolve(root, dir), { recursive: true });
  for (const f of files) {
    const src = resolve(root, f);
    if (!existsSync(src)) throw new Error(`missing web file: ${f}`);
    cpSync(src, resolve(root, dir, f));
  }
}
console.log(`Synced ${files.length} web files → ${targets.join(", ")}`);
