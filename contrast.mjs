// 74.1: text contrast on the photo background, measured in pixels (axe skips text over images and gradients).
// «Сегодня», «Цель», «Деньги», «Настройки» at 06:50 / 13:30 / 17:40 / 21:30, dark and light, 390×844, scrolled to the end.
// For every text the pixels under its glyphs are compared with the text colour; the worst 5 % must give ≥ 4.5:1 (3:1 for large text).
//   node tests/contrast.mjs            OUT=folder node tests/contrast.mjs  (also saves the shots)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = process.env.ROOT || fileURLToPath(new URL("..", import.meta.url)), OUT = process.env.OUT; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const types = { ".woff2": "font/woff2", ".wav": "audio/wav", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((q, s) => { let p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); s.end(d); }); }).listen(0);
const APP = `http://localhost:${server.address().port}/index.html`;
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url"), UID = "11111111-1111-1111-1111-111111111111";
const session = { access_token: `x.${b64({ sub: UID, email: "me@test.tj", exp: 4102444800 })}.s`, refresh_token: "r1", token_type: "bearer", user: { id: UID, email: "me@test.tj" } };
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const report = [];
// text over photo/gradients: hide all text, take a shot, and compare each text colour with the worst 5 % of the pixels behind it
async function pixelContrast(page, v) {
  const items = await page.evaluate(v => {
    const out = [], root = document.getElementById(v), H = innerHeight;
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    for (const el of root.querySelectorAll("*")) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent))) continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || el.closest("[aria-hidden=true]")) continue;
      // 74.5: text partly under the fixed top bar or the bottom tabs is measured at the next scroll step, not through the bar
      { const bar = document.querySelector(".bottom"), top = document.querySelector("header"), bt = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : H, hb = top && getComputedStyle(top).position.match(/fixed|sticky/) ? top.getBoundingClientRect().bottom : 0;
        if (r.bottom > bt || r.top < hb) continue; }
      { const cx = r.left + r.width / 2, cy = Math.min(Math.max(r.top + r.height / 2, 1), H - 1), hit = document.elementFromPoint(cx, cy); if (!hit || !(el.contains(hit) || hit.contains(el))) continue; }
      const fs = parseFloat(cs.fontSize), fw = Number(cs.fontWeight) || 400, c = parse(cs.color);
      if (c.a * op < 0.05) continue;
      out.push({ sel: (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]) + " «" + el.textContent.trim().slice(0, 24) + "»", x: Math.max(0, r.left), y: Math.max(0, r.top), w: r.width, h: Math.min(r.bottom, H) - Math.max(0, r.top), c, op, large: fs >= 24 || (fs >= 18.66 && fw >= 700) });
    }
    return out;
  }, v);
  const shotA = (await page.screenshot()).toString("base64");
  const st = await page.addStyleTag({ content: "*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important} #" + v + " svg, #" + v + " img:not(.jl-sky img){visibility:hidden!important}" });
  await page.waitForTimeout(60);
  const shot = (await page.screenshot()).toString("base64");
  await page.evaluate(el => el.remove(), st);
  return page.evaluate(([shotA, shot, items]) => new Promise(res => { const imgA = new Image(), img = new Image(); let n = 0; const go = () => { if (++n < 2) return;
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const cA = document.createElement("canvas"); cA.width = img.width; cA.height = img.height; const gA = cA.getContext("2d"); gA.drawImage(imgA, 0, 0);
    const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, L = (r, gg, b) => .2126 * lin(r) + .7152 * lin(gg) + .0722 * lin(b);
    const dpr = img.width / innerWidth, bad = [];
    for (const it of items) {
      const box = [Math.round(it.x * dpr), Math.round(it.y * dpr), Math.max(1, Math.round(it.w * dpr)), Math.max(1, Math.round(it.h * dpr))];
      const d = g.getImageData(...box).data, dA = gA.getImageData(...box).data, px = [];
      // only the pixels under the glyphs (they change when the text is hidden); emoji and icons stay the same and are not «background»
      for (let i = 0; i < d.length; i += 4) { const dist = (a, j) => Math.abs(a[j] - it.c.r) + Math.abs(a[j + 1] - it.c.g) + Math.abs(a[j + 2] - it.c.b), db = dist(d, i);
        if (Math.abs(d[i] - dA[i]) + Math.abs(d[i + 1] - dA[i + 1]) + Math.abs(d[i + 2] - dA[i + 2]) > 30 && dist(dA, i) < db * 0.5) px.push([d[i], d[i + 1], d[i + 2]]); }
      if (px.length < 8) continue;
      const a = it.c.a * it.op;
      const worst = []; for (const [r, gg, b] of px) { const tr = it.c.r * a + r * (1 - a), tg = it.c.g * a + gg * (1 - a), tb = it.c.b * a + b * (1 - a); const l1 = L(tr, tg, tb), l2 = L(r, gg, b); worst.push((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)); }
      worst.sort((p, q) => p - q); const ratio = worst[Math.floor(worst.length * .05)] || 21, need = it.large ? 3 : 4.5;
      if (ratio < need) bad.push(it.sel + " " + ratio.toFixed(2));
    }
    res(bad); }; imgA.onload = img.onload = go; imgA.src = "data:image/png;base64," + shotA; img.src = "data:image/png;base64," + shot; }), [shotA, shot, items]);
}
for (const theme of (process.env.THEMES || "dark,light").split(","))
for (const time of ["06:50", "13:30", "17:40", "21:30"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", locale: "ru-RU", timezoneId: "Asia/Dushanbe", reducedMotion: "reduce" });
  await ctx.route(/supabase\.co/, r => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(a => { localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); if (!localStorage.getItem("LIFE_CONTROL_V52")) localStorage.setItem("LIFE_CONTROL_V52", JSON.stringify({ version: 58, settings: { onboarded: true } })); }, JSON.stringify(session));
  const page = await ctx.newPage(); page.on("pageerror", e => console.log("pageerror", e.message));
  await page.clock.setFixedTime(new Date(`2026-10-16T${time}:00+05:00`));
  await page.goto(APP); await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true, null, { timeout: 15000 });
  await page.addStyleTag({ content: "#toast{display:none!important}" });
  await page.evaluate(t => { const at = new Date().toISOString(), k = keyDay();
    state.profile.name = "Тест"; state.debts = { ...state.debts, bank: 90000, firms: 10000, monthlyPayment: 4500 };
    state.profits.push({ id: "p1", amount: 8000, sourceGroup: "Зарплата", at, dateKey: k }); state.expenses.push({ id: "e1", amount: 300, category: "Еда", at, dateKey: k });
    state.tasks.push({ id: "t1", title: "Позвонить", time: "23:00", date: k, createdAt: at }, { id: "t2", title: "Отчёт по работе", time: "09:00", date: k, createdAt: at });
    state.habits = [{ id: "h1", title: "Спорт", kind: "weekly", target: 3 }]; state.goal.finance.targetAmount = 50000; state.goal.finance.savedAmount = 12000;
    state.goal.title = "Купить квартиру"; state.goal.milestones = [{ id: "m1", title: "Накопить взнос", done: true, doneAt: at }, { id: "m2", title: "Закрыть кредит", done: false }, { id: "m3", title: "Ипотека", done: false }];
    if (typeof syncMainGoalMirror === "function") syncMainGoalMirror(); ensureDebtHistory();
    // 74.5: the salary line on «Сегодня» and the month summary on «Деньги» are measured too
    state.debts.salaryAsk = k.slice(0, 7); state.debts.monthSum = { month: "2026-09", paid: 4500, days: 30, left: 100000, text: "В сентябре погашено 4 500 сомони. Свобода ближе на 30 дней. Осталось 100 000 сомони", at }; state.settings.theme = t; setTheme(); saveState(); renderAll(); if (typeof setSky === "function") setSky(); }, theme);
  
  for (const v of ["viewToday", "viewGoal", "viewMoney", "viewSettings"]) {
    await page.evaluate(v => { closeModal?.(); showView(v); window.scrollTo(0, 0); }, v); await page.waitForTimeout(400);
    const name = `${theme}-${time.replace(":", "")}-${v}`;
    if (OUT) await page.screenshot({ path: path.join(OUT, name + ".png") });
    const bad = [];
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 700) { await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForTimeout(120); bad.push(...(await pixelContrast(page, v)).map(x => "@" + y + " " + x)); }
    report.push([name, bad.length, bad.slice(0, 4)]);
  }
  await ctx.close();
}
await browser.close(); server.close();
let total = 0; for (const [n, c, ex] of report) { total += c; if (c) { console.log(n, c, ex.join(" | ")); if (process.env.GITHUB_ACTIONS) console.log(`::error title=contrast ${n}::${c} below the norm: ${ex.join(" | ")}`); } }
console.log(total ? "contrast: " + total + " texts below the norm" : "contrast: " + report.length + " screens, 0 texts below 4.5:1");
process.exit(total ? 1 : 0);
