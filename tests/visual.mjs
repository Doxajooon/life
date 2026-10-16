// Visual snapshot harness: every screen and every window at 360 / 390 / 1366 px in both themes.
// Saves full-page PNGs and a dump of computed styles, so a CSS clean-up can be proven to change nothing.
//   OUT=folder node tests/visual.mjs                 — take the snapshots
//   node tests/visual.mjs compare <folderA> <folderB> — compare two runs (pixels ≤ 0.5 % per shot, styles equal)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

if (process.argv[2] === "compare") {
  const [A, B] = process.argv.slice(3);
  const page = await browser.newPage();
  const files = fs.readdirSync(A).filter(f => f.endsWith(".png")).sort();
  let bad = 0, worst = 0;
  for (const f of files) {
    if (!fs.existsSync(path.join(B, f))) { console.log("MISSING", f); bad++; continue; }
    const a = fs.readFileSync(path.join(A, f)).toString("base64"), b = fs.readFileSync(path.join(B, f)).toString("base64");
    const r = a === b ? { diff: 0, total: 1, size: true } : await page.evaluate(async ([a, b]) => {
      const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + src; });
      const [x, y] = await Promise.all([img(a), img(b)]);
      const W = Math.max(x.width, y.width), H = Math.max(x.height, y.height);
      const px = i => { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, W, H).data; };
      const p = px(x), q = px(y); let diff = 0;
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) diff++;
      return { diff, total: W * H, size: x.width === y.width && x.height === y.height };
    }, [a, b]);
    const pct = r.diff / r.total * 100; worst = Math.max(worst, pct);
    if (pct > 0.5 || !r.size) { bad++; console.log("DIFF", f, pct.toFixed(3) + "%", r.size ? "" : "(size differs)"); }
  }
  let styleDiffs = 0;
  for (const f of fs.readdirSync(A).filter(f => f.endsWith(".json")).sort()) {
    const a = JSON.parse(fs.readFileSync(path.join(A, f), "utf8")), b = fs.existsSync(path.join(B, f)) ? JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) : {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) { if (styleDiffs++ < 40) console.log("STYLE", f, k, "\n   A:", String(a[k]).slice(0, 300), "\n   B:", String(b[k]).slice(0, 300)); }
  }
  console.log(`${files.length} shots, ${bad} over 0.5 % (worst ${worst.toFixed(3)} %), ${styleDiffs} computed-style differences`);
  await browser.close(); process.exit(bad || styleDiffs ? 1 : 0);
}

const OUT = process.env.OUT || "visual-out";
fs.mkdirSync(OUT, { recursive: true });
const types = { ".woff2": "font/woff2", ".wav": "audio/wav", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0])); if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(data); });
}).listen(0);
const APP = `http://localhost:${server.address().port}/index.html`;
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const UID = "11111111-1111-1111-1111-111111111111";
const token = `x.${b64({ sub: UID, email: "me@test.tj", exp: 4102444800 })}.s`;
const session = { access_token: token, refresh_token: "r1", token_type: "bearer", user: { id: UID, email: "me@test.tj" } };

const VIEWS = ["viewToday", "viewGoal", "viewGoalEdit", "viewMoney", "viewNotes", "viewNoteEdit", "viewSettings", "viewDisplay", "viewNotifications", "viewProfile"];
const WINDOWS = [
  ["quick", "openQuickAdd()"], ["expense", "openMoneyForm('expense')"], ["profit", "openMoneyForm('profit')"], ["expense-edit", "openMoneyEdit('expense','swE')"],
  ["transfer", "openTransferForm()"], ["txtype", "openTxTypePicker()"], ["task", "openTaskForm()"], ["habit", "openHabitEditor()"], ["bank-new", "openBudget()"], ["bank", "openBudget('swB')"],
  ["bank-topup", "openBankTopup('swB')"], ["debt", "openDebtEdit()"], ["debt-history", "openDebtHistory('all')"], ["goal-edit", "openGoalEdit()"], ["goal-finance", "openGoalFinanceEdit()"],
  ["goal-saving", "openGoalSaving()"], ["calendar", "openCalendar()"], ["settings", "openSettings()"], ["security", "openSecurity()"], ["trash", "openTrash()"], ["move", "openMoveDevice()"],
  ["ai", "openGeminiAnalysis()"], ["life", "openLifeAnalysis()"], ["search", "openSearch()"], ["achievement", "openAchievement()"], ["backup", "openBackupDialog()"],
  ["backups", "openBackups()"], ["profile", "openProfileEdit()"], ["reports", "openReportHistory()"], ["day", "openDayProgress()"], ["cash", "openMetricDetail('cash')"],
];
const PLACES = [
  ...VIEWS.map(v => [v, `closeModal(); showView("${v}")`]),
  ...["tx", "cal"].map(t => ["viewMoney-" + t, `closeModal(); showView("viewMoney"); document.querySelector('[data-money-tab="${t}"]').click()`]),
  ["auth", `closeModal(); document.getElementById("authLock").hidden=false; document.body.classList.add("auth-locked")`],
  ...WINDOWS.map(([n, o]) => ["w-" + n, `document.getElementById("authLock").hidden=true; document.body.classList.remove("auth-locked"); closeModal(); showView("viewToday"); ${o}`]),
];
const PROPS_SKIP = /^(transition|animation|will-change)/;

for (const width of (process.env.WIDTHS || "360,390,1366").split(",").map(Number)) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 1000 ? 800 : 844 }, serviceWorkers: "block", locale: "ru-RU", timezoneId: "Asia/Dushanbe", reducedMotion: "reduce" });
  await ctx.route(/supabase\.co/, r => { const u = new URL(r.request().url()); const send = b => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, contentType: "application/json", body: JSON.stringify(b) });
    if (r.request().method() === "OPTIONS") return send(null); if (u.pathname.startsWith("/functions/")) return send({ ok: true, model: "mock", output_text: "ПЛЮСЫ — ровный ритм.\nШАГ — один платёж.", sources: [] }); return send([]); });
  await ctx.addInitScript(a => { localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); if (!localStorage.getItem("LIFE_CONTROL_V52")) localStorage.setItem("LIFE_CONTROL_V52", JSON.stringify({ version: 58, settings: { onboarded: true } })); let s = 42; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; }, JSON.stringify(session));
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.clock.setFixedTime(new Date("2026-10-16T11:00:00+05:00"));
  await page.goto(APP);
  await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true, null, { timeout: 15000 });
  await page.addStyleTag({ content: "#toast{display:none!important} *{caret-color:transparent!important}" });
  await page.evaluate(() => {
    const at = "2026-10-16T09:00:00.000Z", k = "2026-10-16";
    state.profile.name = "Тест"; state.debts = { ...state.debts, bank: 90000, firms: 10000, monthlyPayment: 4500 };
    state.profits.push({ id: "swP", amount: 8000, sourceGroup: "Зарплата", at, dateKey: k }); state.expenses.push({ id: "swE", amount: 300, category: "Еда", at, dateKey: k }, { id: "d1", amount: 4000, category: "Платёж по долгу", debtPayment: "bank", transfer: true, at, dateKey: k });
    state.tasks.push({ id: "swT", title: "Позвонить", time: "23:00", date: k, createdAt: at }); state.notes.push({ id: "n1", title: "Идея", body: "текст", at, category: "work" });
    state.habits = [{ id: "h1", title: "Спорт", kind: "weekly", target: 3 }]; state.budgets = [{ id: "swB", name: "Поездки", planned: 1000, tops: [] }]; state.goal.finance.targetAmount = 50000;
    state.goal.title = "Тестовая цель"; state.goal.milestones = [{ id: "m1", title: "Этап один", done: true, doneAt: at }, { id: "m2", title: "Этап два", done: false }, { id: "m3", title: "Этап три", done: false }];
    ensureDebtHistory(); saveState(); renderAll();
    window.confirm = () => false; window.prompt = () => null; window.alert = () => {};
  });
  if (process.env.FULL) await page.evaluate(() => { window.__fullStyles = true; });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(t => { state.settings.theme = t; setTheme(); }, theme);
    for (const [name, js] of PLACES.filter(([n]) => !process.env.PLACES || process.env.PLACES.split(",").includes(n))) {
      await page.evaluate(js => { eval(js); window.scrollTo(0, 0); }, js);
      await page.waitForTimeout(250);
      await page.evaluate(() => document.fonts.ready);
      const file = `${width}-${theme}-${name}`;
      await page.screenshot({ path: path.join(OUT, file + ".png"), fullPage: true, animations: "disabled", caret: "hide" });
      const dump = await page.evaluate(skip => {
        const re = new RegExp(skip), out = {}; let i = 0;
        const root = document.getElementById("modalBack").classList.contains("open") ? document.getElementById("modalBack") : document.body;
        for (const el of [document.documentElement, document.body, ...root.querySelectorAll("*")]) {
          if (el.closest("svg symbol, defs, script, style")) continue;
          const key = (i++) + ":" + el.tagName + (el.id ? "#" + el.id : "") + "." + String(el.className?.baseVal ?? el.className).trim().split(/\s+/).slice(0, 2).join(".");
          for (const pseudo of [null, "::before", "::after"]) {
            const cs = getComputedStyle(el, pseudo); if (pseudo && (cs.content === "none" || cs.content === "normal")) continue;
            const v = []; for (let j = 0; j < cs.length; j++) { const p = cs[j]; if (!re.test(p)) v.push(p + ":" + cs.getPropertyValue(p)); }
            const t = v.sort().join(";"); let h = 5381; for (let j = 0; j < t.length; j++) h = ((h << 5) + h + t.charCodeAt(j)) | 0;
            out[key + (pseudo || "")] = (h >>> 0).toString(36);
            if (window.__fullStyles) out[key + (pseudo || "") + " FULL"] = t;
          }
        }
        return out;
      }, PROPS_SKIP.source);
      fs.writeFileSync(path.join(OUT, file + ".json"), JSON.stringify(dump));
    }
  }
  await ctx.close();
  console.log("done", width);
}
await browser.close(); server.close();
