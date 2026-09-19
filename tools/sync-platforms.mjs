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
    const sourcePath=resolve(root,"public",f);
    try{cpSync(sourcePath,resolve(root,targetRoot,f));}catch{}
  }
}

console.log("Synced web → public, Android, desktop-native and desktop Web.");
