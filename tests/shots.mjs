// Снимки экрана «Сегодня» 390×844 (новый пользователь и аккаунт с данными, тёмная и светлая тема) + высота страницы.
//   OUT=папка node tests/shots.mjs      (CHROME_PATH=... если Chromium установлен отдельно)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)), OUT = process.env.OUT || "shots";
fs.mkdirSync(OUT, { recursive: true });
const types = { ".woff2": "font/woff2", ".wav": "audio/wav", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => { let p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0])); if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(d); }); }).listen(0);
const APP = `http://localhost:${server.address().port}/index.html`, UID = "11111111-1111-1111-1111-111111111111";
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = () => `x.${b64({ sub: UID, email: "me@test.tj", exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;
const session = { access_token: token(), refresh_token: "r1", token_type: "bearer", user: { id: UID, email: "me@test.tj" } };
// made-up data of a person who used the app before 75: three stages, two debts with one payment, tasks, habits, money
const OWNER = { version: 58, settings: { onboarded: true, quoteSet: "general" }, profile: { name: "Тест", currency: "сомони" }, income: 9000,
  debts: { bank: 30000, firms: 12000, monthlyPayment: 3000, labels: { bank: "Банк", firms: "Фирмы" } }, debtBaseline: 46000,
  day: { steps: [{ id: "s1", title: "Работа в офисе", text: "", time: "09:00", end: "18:00", details: ["Отчёт клиенту"] }, { id: "s2", title: "Курс по Excel", text: "", time: "19:00", end: "21:00", details: [] }, { id: "s3", title: "Итог дня", text: "", time: "21:30", end: "22:00", details: [] }] },
  goal: { title: "Закрыть все долги", why: "", next: "", milestones: [{ id: "m1", title: "Закрыть долг фирмам", done: false }], finance: { targetAmount: 0 } },
  tasks: [{ id: "t1", title: "Позвонить в банк", date: "2026-10-20", time: "11:00", done: false, createdAt: "2026-10-20T03:00:00Z" }, { id: "t2", title: "Купить продукты", date: "2026-10-20", time: "", done: true, createdAt: "2026-10-20T03:00:00Z" }],
  habits: [{ id: "h1", title: "Спорт 20 минут", kind: "daily", target: 7 }], habitLog: {},
  profits: [{ id: "p1", amount: 9000, at: "2026-10-05T08:00:00Z", dateKey: "2026-10-05", source: "Зарплата", sourceGroup: "Зарплата" }],
  expenses: [{ id: "e1", amount: 4000, at: "2026-10-06T08:00:00Z", dateKey: "2026-10-06", category: "Платёж по долгу", debtPayment: "bank", transfer: true }, { id: "e2", amount: 350, at: "2026-10-19T08:00:00Z", dateKey: "2026-10-19", category: "Еда" }],
  reports: { "2026-10-19": { done: "Сдал отчёт", block: "", tomorrow: "Позвонить в банк", closedAt: "2026-10-19T17:00:00Z", steps: { s1: true, s2: true, s3: true } } } };
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const out = [];
for (const who of ["new", "owner"]) for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block", locale: "ru-RU", timezoneId: "Asia/Dushanbe" });
  let row = who === "owner" ? { state: OWNER, updated_at: "2026-10-20T03:00:00+00:00", schema_version: 58, device_id: "other" } : null;
  await ctx.route(/supabase\.co/, async r => { const req = r.request(), u = new URL(req.url()), cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const send = (s, b) => r.fulfill({ status: s, headers: cors, contentType: "application/json", body: JSON.stringify(b) });
    if (req.method() === "OPTIONS") return send(200, {});
    if (u.pathname === "/auth/v1/user") return send(200, { id: UID, email: "me@test.tj" });
    if (u.pathname === "/rest/v1/life_state") { if (req.method() === "GET") return send(200, row ? [row] : []); const b = JSON.parse(req.postData() || "{}"); row = { ...b, updated_at: "2026-10-20T03:00:0" + (Math.random() * 9 | 0) + "+00:00" }; return send(201, [row]); }
    if (u.pathname === "/rest/v1/life_state_history") return send(200, []);
    return send(200, {}); });
  await ctx.addInitScript(([s, theme, who]) => { localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", s); localStorage.setItem("LIFE_CONTROL_DESIGN_V56", "1"); if (!localStorage.getItem("LIFE_CONTROL_V52")) localStorage.setItem("LIFE_CONTROL_V52", JSON.stringify({ version: 58, settings: { onboarded: true, theme } })); }, [JSON.stringify(session), theme, who]);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-20T07:40:00+05:00") });
  await page.goto(APP);
  await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true, null, { timeout: 15000 });
  await page.evaluate(t => { state.settings.theme = t; setTheme(); renderAll(); window.scrollTo(0, 0); }, theme);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, buttons: [...document.querySelectorAll("#viewToday button")].filter(b => b.offsetParent).length }));
  const f = `${OUT}/today-${who}-${theme}.png`;
  await page.screenshot({ path: f });
  await page.screenshot({ path: `${OUT}/today-${who}-${theme}-full.png`, fullPage: true });
  out.push(`${who} ${theme}: ${info.h}px (${(info.h / 844).toFixed(2)} экрана), кнопок ${info.buttons}`);
  await ctx.close();
}
console.log(out.join("\n"));
await browser.close(); server.close();
