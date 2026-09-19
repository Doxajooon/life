import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const root=resolve(new URL("..",import.meta.url).pathname);
mkdirSync(resolve(root,"public"),{recursive:true});
cpSync(resolve(root,"index.html"),resolve(root,"public/index.html"));
mkdirSync(resolve(root,"android/app/src/main/assets"),{recursive:true});
cpSync(resolve(root,"index.html"),resolve(root,"android/app/src/main/assets/index.html"));
for(const f of ["manifest.webmanifest","icon.svg","sw.js"]){
 const p=resolve(root,"public",f); try{cpSync(p,resolve(root,"android/app/src/main/assets",f));}catch{}
}
mkdirSync(resolve(root,"desktop/Web"),{recursive:true});
cpSync(resolve(root,"index.html"),resolve(root,"desktop/Web/index.html"));
for(const f of ["manifest.webmanifest","icon.svg","sw.js"]){
 const p=resolve(root,"public",f); try{cpSync(p,resolve(root,"desktop/Web",f));}catch{}
}
console.log("Synced web → public, Android assets, desktop Web.");
