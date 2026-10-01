import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(new URL("..",import.meta.url).pathname);
const source=resolve(root,"index.html");
const targets=[
  "public/index.html",
  "android/app/src/main/assets/index.html",
  "desktop-native/web/index.html",
  "desktop/Web/index.html"
];

for(const target of targets){
  mkdirSync(resolve(root,target,".."),{recursive:true});
  cpSync(source,resolve(root,target));
}

for(const targetRoot of ["public","android/app/src/main/assets","desktop-native/web","desktop/Web"]){
  for(const f of ["manifest.webmanifest","icon.svg","sw.js"]){
    // Root files are the single source of truth. A missing source must fail loudly, not be skipped.
    cpSync(resolve(root,f),resolve(root,targetRoot,f));
  }
}

console.log("Synced web → public, Android, desktop-native and desktop Web.");
