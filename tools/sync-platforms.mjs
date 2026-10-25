// Copies the web app (root files = the only source of truth) into the Android and Windows projects.
// CI runs this before every build; the copies are git-ignored, so they can never drift.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // works on Windows too (no "/D:/" paths)
const files = ["index.html", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable.png", "fonts/inter-cyrillic.woff2", "fonts/inter-latin.woff2", "fonts/manrope-cyrillic.woff2", "fonts/manrope-latin.woff2", "fonts/nunito-cyrillic.woff2", "fonts/nunito-latin.woff2", "sounds/jamal-dawn.wav", "sounds/jamal-nature.wav", "images/bg-kaaba.jpg"];
const targets = ["android/app/src/main/assets", "desktop/Web"];

for (const dir of targets) {
  mkdirSync(resolve(root, dir, "fonts"), { recursive: true });
  mkdirSync(resolve(root, dir, "sounds"), { recursive: true });
  mkdirSync(resolve(root, dir, "images"), { recursive: true });
  for (const f of files) {
    const src = resolve(root, f);
    if (!existsSync(src)) throw new Error(`missing web file: ${f}`);
    cpSync(src, resolve(root, dir, f));
  }
}
console.log(`Synced ${files.length} web files → ${targets.join(", ")}`);
