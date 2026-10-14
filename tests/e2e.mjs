// Jamal Life end-to-end tests (Playwright + Chromium).
// A fake Supabase (auth with expiring JWTs, life_state with row versions) runs inside the test,
// so sync, merges between devices, session expiry and reminders are tested for real.
//   npm run test:e2e            (CHROME_PATH=/path/to/chrome to use a preinstalled browser)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UID = "11111111-1111-1111-1111-111111111111";
const results = [];
let failed = 0;
async function test(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("PASS", name); }
  catch (e) { failed++; results.push(["FAIL", name, e.message]); console.log("FAIL", name, "\n   ", e.message.split("\n").slice(0, 6).join(" ")); }
}

// ---------- static server for the app ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(0);
const APP = `http://localhost:${server.address().port}/index.html`;

// ---------- fake Supabase ----------
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function makeCloud() {
  const cloud = { row: null, refresh: new Set(), seq: 0, hits: [], stamp: Date.parse("2026-10-14T05:00:00Z"), failRefresh: false };
  cloud.token = (ttlSec = 3600) => `x.${b64({ sub: UID, email: "me@test.tj", exp: Math.floor(Date.now() / 1000) + ttlSec })}.s`;
  cloud.session = (ttlSec = 3600) => { const r = "r" + (++cloud.seq); cloud.refresh.add(r); return { access_token: cloud.token(ttlSec), refresh_token: r, token_type: "bearer", user: { id: UID, email: "me@test.tj" } }; };
  cloud.nextStamp = () => new Date(cloud.stamp += 1000).toISOString().replace("Z", "+00:00");
  const ok = (auth) => { const m = /^Bearer x\.([^.]+)\.s$/.exec(auth || ""); if (!m) return false; const p = JSON.parse(Buffer.from(m[1], "base64url")); return p.exp * 1000 > Date.now(); };
  cloud.handle = async (route) => {
    const req = route.request(), url = new URL(req.url()), m = req.method(), cors = { "access-control-allow-origin": "*" };
    const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (cloud.down) return route.abort("internetdisconnected");
    cloud.hits.push(m + " " + url.pathname + (url.search.includes("select=updated_at") ? "?meta" : ""));
    if (m === "OPTIONS") return route.fulfill({ status: 200, headers: { ...cors, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse(req.postData() || "{}");
      if (url.searchParams.get("grant_type") === "refresh_token") {
        if (cloud.failRefresh || !cloud.refresh.has(body.refresh_token)) return send(400, { error: "invalid_grant" });
        cloud.refresh.delete(body.refresh_token); return send(200, cloud.session());
      }
      return send(200, cloud.session());
    }
    if (url.pathname === "/auth/v1/user") return ok(req.headers().authorization) ? send(200, { id: UID, email: "me@test.tj" }) : send(401, { msg: "expired" });
    if (url.pathname.startsWith("/functions/")) return ok(req.headers().authorization) ? send(200, { ok: true, model: "mock", output_text: "Ответ <img src=x onerror=window.__xss=1>", sources: [] }) : send(401, { error: "auth" });
    if (url.pathname === "/rest/v1/life_state") {
      if (!ok(req.headers().authorization)) return send(401, { message: "JWT expired" });
      if (m === "GET") {
        if (!cloud.row) return send(200, []);
        const sel = url.searchParams.get("select") || "";
        const r = { updated_at: cloud.row.updated_at };
        if (sel.includes("state")) Object.assign(r, { state: cloud.row.state, schema_version: cloud.row.schema_version });
        return send(200, [r]);
      }
      const body = JSON.parse(req.postData() || "{}");
      if (m === "POST") { cloud.row = { ...body, updated_at: cloud.nextStamp() }; return send(201, [cloud.row]); }
      if (m === "PATCH") {
        const want = (url.searchParams.get("updated_at") || "").replace(/^eq\./, "");
        if (!cloud.row || cloud.row.updated_at !== want) return send(200, []);
        cloud.row = { ...cloud.row, ...body, updated_at: cloud.nextStamp() }; return send(200, [cloud.row]);
      }
    }
    return send(404, {});
  };
  return cloud;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
async function device(cloud, { viewport = { width: 390, height: 844 }, session, sw = "block", init, clock } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: sw, locale: "ru-RU", timezoneId: "Asia/Dushanbe" });
  await ctx.route(/supabase\.co/, r => cloud.handle(r));
  if (session !== null) {
    const s = session || cloud.session();
    await ctx.addInitScript(a => { if (!localStorage.getItem("LIFE_CONTROL_SUPABASE_AUTH_V1")) localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); }, JSON.stringify(s));
  }
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  if (clock) await page.clock.install({ time: clock });
  await page.goto(APP);
  await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true, null, { timeout: 10000 });
  return { ctx, page };
}
const sync = page => page.evaluate(async () => { while (cloudSyncInFlight) await cloudSyncInFlight.catch(() => {}); return cloudAutoSync(); });

// ================= tests =================
await test("Без сессии показывается экран входа", async () => {
  const cloud = makeCloud();
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route(/supabase\.co/, r => cloud.handle(r));
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(APP); await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => document.body.classList.contains("auth-locked")), "app is not locked");
  assert.equal(errs.length, 0, errs.join("; "));
  await ctx.close();
});

for (const [label, viewport] of [["телефон", { width: 390, height: 844 }], ["ПК", { width: 1366, height: 800 }]]) {
  await test(`Все экраны открываются без ошибок (${label})`, async () => {
    const { ctx, page } = await device(makeCloud(), { viewport });
    for (const v of ["viewToday", "viewGoal", "viewGoalEdit", "viewMoney", "viewNotes", "viewNoteEdit", "viewSettings", "viewDisplay", "viewNotifications", "viewProfile"]) {
      await page.evaluate(v => showView(v), v); await page.waitForTimeout(120);
      assert.ok(await page.evaluate(v => document.getElementById(v).offsetParent !== null, v), v + " hidden");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, v + " scrolls sideways");
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}

await test("Все окна и диалоги открываются без ошибок", async () => {
  const { ctx, page } = await device(makeCloud());
  const bad = await page.evaluate(async () => {
    const out = [];
    const names = Object.keys(window).filter(k => /^open[A-Z]/.test(k) && typeof window[k] === "function" && !["openLifeDB", "openLegacyDB"].includes(k));
    for (const f of names) { try { await window[f](...(f === "openMetricDetail" ? ["cash"] : f === "openMoneyForm" ? ["expense"] : [])); } catch (e) { out.push(f + ": " + e.message); } try { closeModal(); showView("viewToday"); } catch (e) {} }
    return { out, n: names.length };
  });
  assert.ok(bad.n >= 25, "only " + bad.n + " dialogs found");
  assert.deepEqual(bad.out, []); assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Кнопки «Сохранить» в формах не перекрыты нижней панелью (360/390/412 px)", async () => {
  for (const width of [360, 390, 412]) {
    const { ctx, page } = await device(makeCloud(), { viewport: { width, height: width * 2 } });
    for (const [open, btn] of [["openMoneyForm('profit')", "#saveMoneyBtn"], ["openMoneyForm('expense')", "#saveMoneyBtn"], ["openTaskForm()", "#saveTaskBtn"]]) {
      await page.evaluate(o => eval(o), open); await page.waitForTimeout(350);
      await page.locator(btn).click({ timeout: 3000 }); // a real click: fails if anything covers the button
      await page.evaluate(() => closeModal()); await page.waitForTimeout(150);
    }
    await ctx.close();
  }
});

await test("Доход, расход, задача, заметка сохраняются и переживают перезагрузку", async () => {
  const { ctx, page } = await device(makeCloud());
  const n0 = await page.evaluate(() => ({ p: state.profits.length, e: state.expenses.length, t: state.tasks.length, n: state.notes.length }));
  await page.evaluate(() => openMoneyForm("profit")); await page.fill("#moneyAmount", "1500"); await page.click("#saveMoneyBtn");
  await page.evaluate(() => openMoneyForm("expense")); await page.fill("#moneyAmount", "250"); await page.click("#saveMoneyBtn");
  await page.evaluate(() => openTaskForm()); await page.fill("#taskTitle", "Позвонить"); await page.click("#saveTaskBtn");
  await page.evaluate(() => { showView("viewNotes"); openNoteEditor(); }); await page.fill("#neTitle", "Идея"); await page.fill("#neBody", "<img src=x onerror=window.__xss=1>"); await page.click("#neSave");
  await page.waitForTimeout(400);
  const n1 = await page.evaluate(() => ({ p: state.profits.length, e: state.expenses.length, t: state.tasks.length, n: state.notes.length }));
  assert.deepEqual(n1, { p: n0.p + 1, e: n0.e + 1, t: n0.t + 1, n: n0.n + 1 });
  await page.evaluate(() => { showView("viewNotes"); renderNotes(); }); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "XSS executed");
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.deepEqual(await page.evaluate(() => ({ p: state.profits.length, e: state.expenses.length, t: state.tasks.length, n: state.notes.length })), n1);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Синхронизация: изменения уходят в облако, повторная проверка ничего не перерисовывает", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await sync(page);
  assert.ok(cloud.row, "nothing was uploaded");
  await page.evaluate(() => { state.expenses.push({ id: "x1", amount: 99, category: "Еда", at: new Date().toISOString() }); saveState(); });
  await sync(page);
  assert.ok(cloud.row.state.expenses.some(x => x.id === "x1"), "change not pushed");
  const renders = await page.evaluate(async () => { let n = 0; const orig = renderAll; window.renderAll = renderAll = () => { n++; orig(); }; for (let i = 0; i < 3; i++) await cloudAutoSync(); return n; });
  assert.equal(renders, 0, "idle sync re-rendered the screen " + renders + " times (flicker)");
  const hits = cloud.hits.slice(-3);
  assert.ok(hits.every(h => h.endsWith("?meta")), "idle sync downloads full state: " + hits.join(", "));
  assert.match(await page.evaluate(() => document.getElementById("cloudSyncState")?.textContent || _syncStatusText), /Синхронизировано/);
  await ctx.close();
});

await test("Два устройства: правки с обоих объединяются, удаление доходит", async () => {
  const cloud = makeCloud();
  const A = await device(cloud), B = await device(cloud);
  await sync(A.page); await sync(B.page);
  await A.page.evaluate(() => { state.expenses.push({ id: "a1", amount: 10, category: "Еда", at: new Date().toISOString() }); saveState(); });
  await B.page.evaluate(() => { state.notes.push({ id: "b1", title: "с телефона", body: "", at: new Date().toISOString(), category: "personal" }); saveState(); });
  await A.page.evaluate(() => { state.notes.push({ id: "a2", title: "с ПК", body: "", at: new Date().toISOString(), category: "personal" }); saveState(); });
  await sync(A.page); await sync(B.page); await sync(A.page);
  for (const d of [A, B]) {
    const s = await d.page.evaluate(() => ({ e: state.expenses.map(x => x.id), n: state.notes.map(x => x.id) }));
    assert.ok(s.e.includes("a1") && s.n.includes("b1") && s.n.includes("a2"), "lost data: " + JSON.stringify(s));
  }
  await A.page.evaluate(() => { state.expenses = state.expenses.filter(x => x.id !== "a1"); saveState(); });
  await sync(A.page); await sync(B.page);
  assert.ok(!(await B.page.evaluate(() => state.expenses.some(x => x.id === "a1"))), "deletion did not reach the other device");
  assert.ok(!cloud.row.state.expenses.some(x => x.id === "a1"));
  await A.ctx.close(); await B.ctx.close();
});

await test("Новое устройство: облачные данные не затираются, записи до первого входа сохраняются", async () => {
  const cloud = makeCloud();
  const A = await device(cloud);
  await A.page.evaluate(() => { state.profile.name = "Джамал"; state.goal.title = "Своя цель"; state.notes.push({ id: "cloud1", title: "из облака", body: "", at: new Date().toISOString() }); saveState(); });
  await sync(A.page); await A.ctx.close();
  // a fresh install that is offline at first: the user writes a note before any sync
  const ctx = await browser.newContext({ serviceWorkers: "block", locale: "ru-RU" });
  await ctx.route(/supabase\.co/, r => cloud.handle(r));
  await ctx.addInitScript(a => { if (!localStorage.getItem("LIFE_CONTROL_SUPABASE_AUTH_V1")) localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); }, JSON.stringify(cloud.session()));
  cloud.down = true; // Supabase unreachable on first start
  const page = await ctx.newPage(); await page.goto(APP);
  await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true);
  await page.evaluate(() => { state.notes.push({ id: "local1", title: "до синхронизации", body: "", at: new Date().toISOString() }); saveState(); });
  cloud.down = false;
  await sync(page);
  const s = await page.evaluate(() => ({ name: state.profile.name, goal: state.goal.title, notes: state.notes.map(n => n.id) }));
  assert.equal(s.name, "Джамал"); assert.equal(s.goal, "Своя цель");
  assert.ok(s.notes.includes("cloud1") && s.notes.includes("local1"), JSON.stringify(s.notes));
  assert.ok(cloud.row.state.notes.some(n => n.id === "local1"), "local note not uploaded");
  await ctx.close();
});

await test("Правка во время идущей синхронизации не теряется", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await sync(page);
  await page.evaluate(async () => {
    state.notes.push({ id: "f1", title: "первая", body: "", at: new Date().toISOString() }); saveState();
    const p = cloudAutoSync();                       // request is in flight…
    state.notes.push({ id: "f2", title: "во время отправки", body: "", at: new Date().toISOString() }); saveState();
    await p;
  });
  await sync(page);
  const ids = cloud.row.state.notes.map(n => n.id);
  assert.ok(ids.includes("f1") && ids.includes("f2"), "lost: " + ids.join(","));
  await ctx.close();
});

await test("Истёкший токен обновляется сам, без запроса пароля", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { session: { ...cloud.session(), access_token: cloud.token(-60) } });
  await page.evaluate(() => { state.notes.push({ id: "r1", title: "после refresh", body: "", at: new Date().toISOString() }); saveState(); });
  assert.equal(await sync(page), true);
  assert.ok(cloud.row?.state.notes.some(n => n.id === "r1"));
  assert.ok(!(await page.evaluate(() => document.body.classList.contains("auth-locked"))), "asked for password needlessly");
  await ctx.close();
});

await test("Сессия отозвана: просит войти, данные не теряются и уходят после входа", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { session: { ...cloud.session(), access_token: cloud.token(-60), refresh_token: "revoked" } });
  await page.evaluate(() => { state.notes.push({ id: "k1", title: "сохранить", body: "", at: new Date().toISOString() }); saveState(); });
  await sync(page); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.body.classList.contains("auth-locked")), "login screen not shown");
  assert.ok(await page.evaluate(() => state.notes.some(n => n.id === "k1")), "local note lost");
  await page.fill("#gateEmail", "me@test.tj"); await page.fill("#gatePassword", "secret123"); await page.click("#gateLoginBtn");
  await page.waitForFunction(() => !document.body.classList.contains("auth-locked"));
  await page.waitForTimeout(800);
  assert.ok(cloud.row?.state.notes.some(n => n.id === "k1"), "note not uploaded after login");
  await ctx.close();
});

await test("Service worker не кэширует запросы к Supabase", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { sw: "allow" });
  await page.waitForFunction(() => navigator.serviceWorker.controller || new Promise(r => navigator.serviceWorker.addEventListener("controllerchange", r)), null, { timeout: 8000 }).catch(() => {});
  await page.reload(); await page.waitForTimeout(800);
  const statuses = await page.evaluate(async () => {
    const u = "https://riqmwueobjazfnhvvumy.supabase.co/auth/v1/user", out = [];
    for (const t of ["good", "bad"]) { const r = await fetch(u, { headers: { Authorization: t === "good" ? "Bearer " + cloudAuth().access_token : "Bearer x.e30.s" } }); out.push(r.status); }
    return out;
  });
  assert.deepEqual(statuses, [200, 401], "a cached answer was served: " + statuses);
  const { cached, origin } = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return { cached: out, origin: location.origin }; });
  assert.ok(cached.length > 0 && cached.every(u => u.startsWith(origin)), "foreign URLs in cache: " + cached.join(", "));
  await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => typeof state === "object");
  await ctx.close();
});

await test("Напоминание о задаче: уведомление, история и звук (в т.ч. пропущенное до 10 мин)", async () => {
  const { ctx, page } = await device(makeCloud(), {
    init: () => {
      window.__osc = 0;
      const AC = window.AudioContext; window.AudioContext = class extends AC { createOscillator() { window.__osc++; return super.createOscillator(); } };
    },
  });
  const r = await page.evaluate(() => {
    const d = new Date(Date.now() - 4 * 60000), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    state.tasks.push({ id: "tk1", title: "Позвонить в банк", time: `${hh}:${mm}`, date: keyDay(), done: false, remind: 0 });
    const before = state.notificationsLog.length; runScheduler(); runScheduler();
    return { added: state.notificationsLog.length - before, title: state.notificationsLog[0]?.title };
  });
  assert.equal(r.added, 1, "expected exactly one reminder, got " + r.added);
  assert.match(r.title, /Позвонить в банк/);
  assert.ok(await page.evaluate(() => window.__osc) >= 4, "chime did not play");
  await ctx.close();
});

await test("Ночь без ошибок: смена суток, напоминания нового дня, фоновая синхронизация", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-14T23:57:00+05:00") });
  await page.evaluate(() => { state.tasks.push({ id: "mid", title: "Утренняя задача", time: "00:02", date: "2026-10-15", remind: 0 }); saveState(); });
  const hitsBefore = cloud.hits.length;
  await page.clock.runFor(6 * 60 * 1000); // 23:57 → 00:03
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ day: keyDay(), log: state.notificationsLog.map(n => n.title), sentDay: JSON.parse(localStorage.getItem("JL_REMINDERS_SENT_V1") || "{}").day }));
  assert.equal(r.day, "2026-10-15");
  assert.ok(r.log.some(t => /Утренняя задача/.test(t)), "reminder after midnight missing: " + r.log.join(" | "));
  assert.equal(r.sentDay, "2026-10-15");
  const fullFetches = cloud.hits.slice(hitsBefore).filter(h => h.startsWith("GET") && !h.endsWith("?meta")).length;
  assert.ok(fullFetches <= 1, "background sync downloaded the full state " + fullFetches + " times");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Android: задачи ставятся будильниками, без двойных уведомлений", async () => {
  const { ctx, page } = await device(makeCloud(), {
    init: () => {
      window.__calls = [];
      window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); return k === "bridgeVersion" ? 2 : undefined; } });
    },
  });
  const res = await page.evaluate(() => {
    __calls.length = 0;
    const d = new Date(Date.now() + 3 * 3600000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    state.tasks.push({ id: "fut", title: "Встреча", time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, date: key, remind: 15 });
    scheduleNativeTasks();
    const once = __calls.filter(c => c[0] === "scheduleOnce").map(c => c[1]);
    __calls.length = 0;
    notify("Задача: тест", "x", "tasks", { native: true });
    const dup = __calls.filter(c => c[0] === "notify").length;
    state.tasks.find(t => t.id === "fut").done = true; scheduleNativeTasks();
    const cancelled = __calls.filter(c => c[0] === "cancel").map(c => c[1]);
    return { once, dup, cancelled };
  });
  assert.deepEqual(res.once.sort(), ["task_fut", "taskpre_fut"]);
  assert.equal(res.dup, 0, "native reminder was notified twice");
  assert.deepEqual(res.cancelled.sort(), ["task_fut", "taskpre_fut"]);
  await ctx.close();
});

await test("Windows: уведомление уходит в трей приложения", async () => {
  const { ctx, page } = await device(makeCloud(), { init: () => { window.__msgs = []; window.chrome = { webview: { postMessage: m => window.__msgs.push(m) } }; } });
  const msgs = await page.evaluate(() => { __msgs.length = 0; notify("Пора: Работа", "Начни", "tasks"); return __msgs; });
  assert.equal(msgs[0]?.type, "notify"); assert.equal(msgs[0]?.title, "Пора: Работа");
  assert.equal(await page.evaluate(() => typeof window.__jlTick), "function");
  await ctx.close();
});

await test("AI-анализ показывает ответ как текст", async () => {
  const { ctx, page } = await device(makeCloud());
  const out = await page.evaluate(async () => { state.ai.enabled = true; await openGeminiAnalysis(); document.getElementById("aiRunBtn").click(); await new Promise(r => setTimeout(r, 1200)); return document.getElementById("aiResult").innerText; });
  assert.match(out, /Ответ/);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "XSS executed");
  await ctx.close();
});

await test("Нагрузка: 3000 операций и 500 заметок", async () => {
  const { ctx, page } = await device(makeCloud());
  const t = await page.evaluate(() => {
    const now = Date.now();
    for (let i = 0; i < 3000; i++) state.expenses.push({ id: "e" + i, amount: (i % 97) + 1, category: "Еда", at: new Date(now - i * 3600e3).toISOString() });
    for (let i = 0; i < 500; i++) state.notes.push({ id: "n" + i, title: "Заметка " + i, body: "текст ".repeat(50), at: new Date(now - i * 864e5).toISOString(), category: "personal" });
    const a = performance.now(); renderAll(); const b = performance.now(); saveState(); const c = performance.now();
    return { render: b - a, save: c - b };
  });
  assert.ok(t.render < 600, "render " + t.render.toFixed(0) + " ms");
  assert.ok(t.save < 200, "save " + t.save.toFixed(0) + " ms");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await browser.close(); server.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
