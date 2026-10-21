// Renders the app icon (icon.svg — the green sprout in a turquoise→gold ring) into every raster the platforms need:
//   icon-192.png, icon-512.png (purpose "any"), icon-maskable.png (full-bleed, artwork inside the 80 % safe circle),
//   desktop/app.ico (16, 32, 48, 256 px, PNG-compressed entries). Run:  node tools/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const svg = readFileSync(root + "icon.svg", "utf8");
// maskable: the same artwork on a square full-bleed background, scaled to 80 % so launchers can crop it to any shape
if (!svg.includes('fill="url(#spbg)"')) throw new Error("icon.svg: background rect #spbg not found");
const maskable = svg.replace('<rect width="512" height="512" rx="112" fill="url(#spbg)"/>', '<rect width="512" height="512" fill="url(#spbg)"/><g transform="translate(51.2 51.2) scale(.8)">').replace(/<\/svg>\s*$/, "</g></svg>");

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
// draw the SVG on a canvas of the exact size (smooth downscaling for the small sizes) and take the PNG bytes
const png = (src, size) => page.evaluate(async ([src, size]) => {
  const img = new Image(); img.src = "data:image/svg+xml;base64," + btoa(src); await img.decode();
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/png").split(",")[1];
}, [src, size]).then(b => Buffer.from(b, "base64"));
writeFileSync(root + "icon-192.png", await png(svg, 192));
writeFileSync(root + "icon-512.png", await png(svg, 512));
writeFileSync(root + "icon-maskable.png", await png(maskable, 512));

const sizes = [16, 32, 48, 256], imgs = [];
for (const s of sizes) imgs.push(await png(svg, s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s === 256 ? 0 : s, e); head.writeUInt8(s === 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += imgs[i].length;
});
writeFileSync(root + "desktop/app.ico", Buffer.concat([head, ...imgs]));
await browser.close();
console.log("wrote icon-192.png, icon-512.png, icon-maskable.png, desktop/app.ico (" + sizes.join(", ") + " px)");
