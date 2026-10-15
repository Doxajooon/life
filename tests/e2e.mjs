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
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); results.push(["PASS", name]); console.log("PASS", name); }
  catch (e) { failed++; results.push(["FAIL", name, e.message]); console.log("FAIL", name, "\n   ", e.message.split("\n").slice(0, 6).join(" "));
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=E2E failed::${name} — ${e.message.replace(/\s+/g, " ").slice(0, 600)}`); }
}

// ---------- static server for the app ----------
const types = { ".woff2": "font/woff2", ".wav": "audio/wav", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
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
    if (url.pathname === "/auth/v1/user" && m === "PUT") { cloud.newPassword = JSON.parse(req.postData() || "{}").password; return ok(req.headers().authorization) ? send(200, { id: UID, email: "me@test.tj" }) : send(401, { msg: "expired" }); }
    if (url.pathname === "/auth/v1/user") return ok(req.headers().authorization) ? send(200, { id: UID, email: "me@test.tj" }) : send(401, { msg: "expired" });
    if (url.pathname.startsWith("/functions/")) {
      if (!ok(req.headers().authorization)) return send(401, { error: "auth" });
      const b = JSON.parse(req.postData() || "{}"); cloud.aiBodies = [...(cloud.aiBodies || []), b];
      if (cloud.aiFail) return send(429, { error: "Бесплатный лимит Gemini на сегодня исчерпан у всех доступных моделей." });
      if (b.mode === "week") return send(200, { ok: true, model: "mock", output_text: "СИЛЬНАЯ СТОРОНА — закрыл 5 дней.\nСЛАБОЕ МЕСТО — **телефон** <img src=x onerror=window.__xss=1>\nШАГ НА НЕДЕЛЮ — после 21:00 телефон на зарядку.", sources: [] });
      return send(200, { ok: true, model: "mock", output_text: "Ответ <img src=x onerror=window.__xss=1>", sources: [] });
    }
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
  if (process.env.CPU_SLOW) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_SLOW) }); }
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

await test("Ссылка из письма «сброс пароля» сразу просит новый пароль и сохраняет его", async () => {
  const cloud = makeCloud();
  const ctx = await browser.newContext({ serviceWorkers: "block", locale: "ru-RU" });
  await ctx.route(/supabase\.co/, r => cloud.handle(r));
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  const sess = cloud.session();
  await page.goto(`${APP}#access_token=${sess.access_token}&refresh_token=${sess.refresh_token}&expires_in=3600&token_type=bearer&type=recovery`);
  await page.locator("#recoveryPassword1").waitFor({ timeout: 5000 });
  await page.fill("#recoveryPassword1", "newpass123"); await page.fill("#recoveryPassword2", "newpass123");
  await page.click("#recoverySaveBtn"); await page.waitForTimeout(600);
  assert.equal(cloud.newPassword, "newpass123", "password was not sent to Supabase");
  assert.ok(!(await page.evaluate(() => location.hash.includes("access_token"))), "token left in the address bar");
  assert.deepEqual(errs, []);
  await ctx.close();
});

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

await test("«Сегодня»: всё в одном потоке, без вкладок и дублей; кнопка «+» работает", async () => {
  const { ctx, page } = await device(makeCloud());
  const info = await page.evaluate(() => ({
    details: document.querySelectorAll("#viewToday details").length,
    crown: !!document.querySelector(".brand-name .jl-crown"),
    order: [...document.querySelectorAll("#viewToday > *")].map(e => e.id || e.className.split(" ").slice(0, 2).join(".")),
    stageRowsInTasks: document.querySelectorAll("#taskList [data-task-stage]").length,
    timeline: document.querySelectorAll("#timeline > *").length,
    motivation: document.getElementById("motivationText").textContent.length,
  }));
  assert.equal(info.details, 0, "collapsible block still present");
  assert.ok(info.crown, "crown missing next to the name");
  assert.equal(info.stageRowsInTasks, 0, "stages duplicated in the task list");
  assert.ok(info.timeline >= 1 && info.motivation > 5, "schedule or motivation not rendered on the main screen");
  for (const [kind, sel] of [["task", "#taskTitle"], ["profit", "#moneyAmount"], ["expense", "#moneyAmount"], ["note", "#neTitle"]]) {
    await page.evaluate(() => showView("viewToday"));
    await page.locator("#quickAddBtn").click();           // real tap: fails if anything covers it
    await page.locator(`[data-quick="${kind}"]`).click();
    await page.waitForTimeout(250);
    assert.ok(await page.locator(sel).isVisible(), kind + " form did not open");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  }
  assert.deepEqual(page.errors, []);
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
  await page.waitForFunction(n => state.notes.length === n, n0.n + 1, { timeout: 5000 }).catch(() => {});
  const n1 = await page.evaluate(() => ({ p: state.profits.length, e: state.expenses.length, t: state.tasks.length, n: state.notes.length }));
  const dbg = n1.n === n0.n + 1 ? "" : JSON.stringify(await page.evaluate(() => ({ view: currentView, title: document.getElementById("neTitle")?.value, body: document.getElementById("neBody")?.value, draft: JSON.stringify(state.drafts?.note || null), toast: document.getElementById("toast")?.textContent })));
  assert.deepEqual(n1, { p: n0.p + 1, e: n0.e + 1, t: n0.t + 1, n: n0.n + 1 }, dbg);
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
    const once = __calls.filter(c => c[0] === "scheduleOnce" || c[0] === "scheduleTask").map(c => c[1]);
    __calls.length = 0;
    notify("Задача: тест", "x", "tasks", { native: true });
    const dup = __calls.filter(c => c[0] === "notify").length;
    state.tasks.find(t => t.id === "fut").done = true; scheduleNativeTasks();
    const cancelled = __calls.filter(c => c[0] === "cancel").map(c => c[1]);
    return { once, dup, cancelled };
  });
  assert.deepEqual(res.once.filter(x => x.includes("fut")).sort(), ["task_fut", "taskpre_fut"]);
  assert.ok(res.once.includes("closeday"), "evening «close the day» alarm missing");
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


// ================= V59 =================
await test("Напоминание: кнопки «Готово» и «Через 15 мин» (Android и браузер)", async () => {
  const { ctx, page } = await device(makeCloud(), {
    init: () => {
      window.__calls = []; window.__pending = JSON.stringify([{ a: "done", task: "t1", at: Date.now() }]);
      window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); if (k === "takeActions") { const v = window.__pending; window.__pending = "[]"; return v; } return k === "bridgeVersion" ? 3 : undefined; } });
    },
  });
  const r = await page.evaluate(() => {
    const k = keyDay();
    state.tasks.push({ id: "t1", title: "Позвонить в банк", time: "23:59", date: k }, { id: "t2", title: "Английский", time: "23:58", date: k });
    __calls.length = 0;
    pullNativeActions();
    const t1 = state.tasks.find(t => t.id === "t1").done;
    notify("Задача: Английский", "Время: 23:58", "tasks", { taskId: "t2" });
    const nt = __calls.find(c => c[0] === "notifyTask");
    applyReminderAction("snooze", "t2");
    const sn = Date.parse(state.tasks.find(t => t.id === "t2").snoozeAt) - Date.now();
    return { t1, nt, sn, scheduled: __calls.filter(c => c[0] === "scheduleOnce" || c[0] === "scheduleTask").map(c => c[1]) };
  });
  assert.equal(r.t1, true, "«Готово» from the notification did not close the task");
  assert.deepEqual(r.nt?.slice(1), ["Задача: Английский", "Время: 23:58", "t2"]);
  assert.ok(r.sn > 14 * 60000 && r.sn <= 15 * 60000, "snooze is not 15 minutes");
  assert.ok(!r.scheduled.includes("task_t1") && r.scheduled.includes("task_t2"), "a done task must not get alarms: " + r.scheduled);
  // browser: the link from a notification button
  const done = await page.evaluate(async () => { state.tasks.push({ id: "t3", title: "Тест", time: "23:57", date: keyDay() }); saveState(); history.replaceState(null, "", location.pathname + "?jlact=done&task=t3"); handleActionLink(); return { done: state.tasks.find(t => t.id === "t3").done, url: location.search }; });
  assert.deepEqual(done, { done: true, url: "" });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Закрыть день: три вопроса и серия дней", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const d = new Date(); const keys = [];
    for (let i = 1; i <= 3; i++) { d.setDate(d.getDate() - 1); keys.push(keyDay(d)); }
    for (const k of keys) state.reports[k] = { done: "x", block: "", tomorrow: "y", closedAt: new Date().toISOString(), steps: {} };
    renderToday();
    const before = document.getElementById("streakDays").textContent;
    return { before, fields: ["rDone", "rBlock", "rTomorrow"].every(id => document.getElementById(id)), future: !!document.getElementById("rFuture") };
  });
  assert.equal(r.before, "3"); assert.ok(r.fields); assert.equal(r.future, false);
  await page.fill("#rDone", "Закрыл все заявки"); await page.fill("#rTomorrow", "Отложить 2 000 на долг");
  await page.click("#saveReportBtn");
  const after = await page.evaluate(() => ({ days: document.getElementById("streakDays").textContent, word: document.getElementById("streakWord").textContent, closed: !!state.reports[keyDay()].closedAt, label: document.getElementById("closeDayLabel").textContent }));
  assert.deepEqual(after, { days: "4", word: "дня", closed: true, label: "День закрыт · обновить" });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("План выплаты долга и лимиты на месяц", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    state.debts = { bank: 100000, firms: 120000, monthlyPayment: 4000 }; state.debtBaseline = 220000;
    state.budgets = [{ id: "b1", name: "Еда", planned: 1000 }];
    state.expenses.push({ id: "e1", amount: 850, category: "Еда", at: new Date().toISOString() });
    saveState(); renderAll(); showView("viewMoney"); renderMoney();
    const plan = document.getElementById("debtPlan").innerText;
    const range = document.getElementById("dpRange");
    range.value = range.max; range.dispatchEvent(new Event("input"));
    const gain = document.getElementById("dpAltGain").textContent;
    return { plan, gain, budget: document.getElementById("budgetList").innerText, log: state.notificationsLog.slice(0, 3).map(n => n.title), today: document.getElementById("todayLimitMeta").textContent, dash: document.getElementById("dashDebtMeta")?.textContent || "" };
  });
  assert.match(r.plan, /через 4 года 7 мес\./, r.plan);
  assert.match(r.gain, /раньше/);
  assert.match(r.budget, /Осталось 150 сомони на \d+ (день|дня|дней) — около \d+ сомони в день/);
  assert.ok(r.log.some(t => /Банк «Еда»: потрачено 85%/.test(t)), JSON.stringify(r.log));
  assert.match(r.today, /^Еда: осталось 150/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Разбор недели от AI", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await page.evaluate(() => { state.ai.enabled = true; renderToday(); });
  await page.click("#wkRun");
  await page.waitForFunction(() => !!state.ai.weekly?.[weekKey()], null, { timeout: 8000 });
  const r = await page.evaluate(() => ({ html: document.getElementById("wkText").innerHTML, label: document.getElementById("wkRunLabel").textContent }));
  assert.match(r.html, /<b>СИЛЬНАЯ СТОРОНА<\/b>/); assert.match(r.html, /<b>ШАГ НА НЕДЕЛЮ<\/b>/);
  assert.ok(!/\*\*/.test(r.html), "markdown leaked");
  assert.equal(r.label, "Обновить разбор");
  assert.equal(await page.evaluate(() => window.__xss), undefined, "XSS executed");
  assert.equal(cloud.aiBodies.at(-1).mode, "week"); assert.match(cloud.aiBodies.at(-1).today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ================= V60 =================
await test("Привычки: отметка, серия и объединение между устройствами", async () => {
  const cloud = makeCloud();
  const A = await device(cloud), B = await device(cloud);
  await A.page.click('[data-habit-idea="0"]');
  const hid = await A.page.evaluate(() => state.habits[0].id);
  await A.page.evaluate(id => { const d = new Date(); state.habitLog[id] = {}; for (let i = 1; i <= 4; i++) { d.setDate(d.getDate() - 1); state.habitLog[id][keyDay(d)] = 1; } saveState(); renderHabits(); }, hid);
  await A.page.click(`[data-habit-check="${hid}"]`);
  const a = await A.page.evaluate(id => ({ on: document.querySelector(`[data-habit-check="${id}"]`).getAttribute("aria-pressed"), sub: document.querySelector(`[data-habit-edit="${id}"] small`).textContent, sum: document.getElementById("habitSummary").textContent }), hid);
  assert.deepEqual(a, { on: "true", sub: "каждый день · 🔥 5 дней", sum: "Сегодня всё выполнено — 1 из 1 🔥" });
  await sync(A.page); await sync(B.page);
  // B adds a second habit and ticks it; A unticks today's mark — both changes must survive
  await B.page.evaluate(() => { addHabit("Спорт", "weekly", 3); const h = state.habits.find(x => x.title === "Спорт"); toggleHabit(h.id); });
  await A.page.evaluate(id => toggleHabit(id), hid);
  await sync(A.page); await sync(B.page); await sync(A.page);
  for (const d of [A, B]) {
    const r = await d.page.evaluate(id => ({ n: state.habits.length, todayFirst: !!state.habitLog[id]?.[keyDay()], past: Object.keys(state.habitLog[id] || {}).length, sport: Object.keys(state.habitLog[state.habits.find(x => x.title === "Спорт").id] || {}).length }), hid);
    assert.deepEqual(r, { n: 2, todayFirst: false, past: 4, sport: 1 });
  }
  assert.deepEqual(A.page.errors, []); assert.deepEqual(B.page.errors, []);
  await A.ctx.close(); await B.ctx.close();
});

await test("Экраны «Деньги» и «Цель»: всё видно сразу, без «Скрыть»; каждый график рисуется", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const now = new Date().toISOString();
    state.profits.push({ id: "p1", amount: 5000, sourceGroup: "Зарплата", at: now }); state.expenses.push({ id: "e1", amount: 300, category: "Еда", at: now }); saveState(); renderAll();
    showView("viewMoney");
    const money = { collapsers: document.querySelectorAll("[data-more], .jl-more-btn").length, chart: document.getElementById("mvChart").innerHTML.length > 0, donut: !/Нет данных|Нет расходов/.test(document.getElementById("expenseDonutCenter").textContent), sources: document.querySelectorAll("#profitSourceList .source-row").length, zeroRows: [...document.querySelectorAll("#profitSourceList .source-val")].filter(x => /^0 /.test(x.textContent)).length, debtChart: !!document.getElementById("debtChart") };
    showView("viewGoal");
    const goalText = document.getElementById("viewGoal").innerText;
    const title = state.goal.title, count = goalText.split(title).length - 1;
    state.goal.finance.targetAmount = 0; saveState(); renderAll(); showView("viewGoal");
    const empty = !document.getElementById("goalMoneyEmpty").hidden && document.getElementById("goalMoneyBody").hidden;
    state.goal.finance.targetAmount = 20000; saveState(); renderAll(); showView("viewGoal");
    const filled = document.getElementById("goalMoneyEmpty").hidden && !document.getElementById("goalMoneyBody").hidden;
    return { money, count, empty, filled, noAnalysis: !document.getElementById("financeAnalysis"), mainInList: !!document.querySelector('#goalList [data-goal-open="' + state.goals.find(g => g.main)?.id + '"]') };
  });
  assert.deepEqual(r, { money: { collapsers: 0, chart: true, donut: true, sources: 1, zeroRows: 0, debtChart: true }, count: 1, empty: true, filled: true, noAnalysis: true, mainInList: false });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Виджет Android и резервные копии", async () => {
  const { ctx, page } = await device(makeCloud(), {
    init: () => { window.__w = []; window.__launch = "quickadd"; window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { if (k === "updateWidget") window.__w.push(JSON.parse(a[0])); if (k === "takeLaunch") { const v = window.__launch; window.__launch = ""; return v; } return k === "bridgeVersion" ? 4 : undefined; } }); },
  });
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => { const last = __w.at(-1); return { steps: last?.steps?.length, quick: document.body.classList.contains("modal-open") }; });
  assert.equal(w.steps, 3); assert.equal(w.quick, true, "widget «+» did not open quick add");
  const n = await page.evaluate(async () => { closeModal(); state.tasks.push({ id: "wt", title: "Позвонить", time: "23:59", date: keyDay() }); saveState(); renderTasks(); return __w.at(-1).tasks.some(t => t.id === "wt" && t.title === "Позвонить"); });
  assert.ok(n, "widget did not get the new task");
  // daily backup: exists, and restore brings an older state back
  const b = await page.evaluate(async () => {
    await mirrorToIndexedDB(JSON.stringify(state), new Date().toISOString());
    const rows = await listDailyBackups(); const before = state.notes.length;
    state.notes.push({ id: "late", title: "после копии", body: "x", at: new Date().toISOString(), category: "personal" }); saveState();
    window.confirm = () => true; await openBackups(); document.querySelector("[data-bk]").click(); await new Promise(r => setTimeout(r, 400));
    return { rows: rows.length, restored: state.notes.length === before && !state.notes.some(n => n.id === "late") };
  });
  assert.deepEqual(b, { rows: 1, restored: true });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ================= V61 =================
await test("Новый телефон: после входа приходит полный пакет данных", async () => {
  const cloud = makeCloud();
  const A = await device(cloud);
  await A.page.evaluate(() => {
    const now = new Date().toISOString(), k = keyDay();
    state.profile.name = "Джамал"; state.income = 9000; state.debts = { bank: 90000, firms: 100000, monthlyPayment: 4500, whatIf: 6000 };
    state.profits.push({ id: "p1", amount: 8000, sourceGroup: "Зарплата", at: now });
    state.expenses.push({ id: "e1", amount: 300, category: "Еда", at: now });
    state.tasks.push({ id: "t1", title: "Звонок", time: "23:00", date: k, remind: 10, createdAt: now });
    state.notes.push({ id: "n1", title: "Идея", body: "текст", at: now, category: "work" });
    state.habits = [{ id: "h1", title: "Спорт", kind: "weekly", target: 3 }]; state.habitLog = { h1: { [k]: 1 } };
    state.budgets = [{ id: "b1", name: "Поездки", planned: 1000, tops: [{ id: "x", month: monthKey(), amount: 300 }] }];
    state.reports[k] = { done: "сделал", block: "", tomorrow: "шаг", closedAt: now, steps: {} };
    state.goals.push({ id: "g9", title: "Машина", icon: "car", color: "blue", target: 50000, createdAt: now });
    state.achievements.push({ id: "a1", text: "Закрыл кредитку", at: now });
    state.day.steps[1].title = "Семья и спорт"; state.settings.every2h = false; state.settings.preMinutes = 15;
    state.ai.weekly = { [weekKey()]: { at: now, text: "СИЛЬНАЯ СТОРОНА — x" } };
    autoCompleteExpiredStages(); // the rhythm closes past stages by time of day; do it here so the result does not depend on the hour
    ensureDebtHistory(); saveState();
  });
  await sync(A.page);
  const want = await A.page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(normalize(clone(state))).filter(([k]) => !SYNC_META_KEYS.includes(k) && !["runtimeErrors", "notificationsLog", "lastReadAt", "drafts"].includes(k)))));
  await A.ctx.close();
  // a brand-new phone: empty storage, the user logs in
  const B = await device(cloud);
  await sync(B.page);
  const got = await B.page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(normalize(clone(state))).filter(([k]) => !SYNC_META_KEYS.includes(k) && !["runtimeErrors", "notificationsLog", "lastReadAt", "drafts"].includes(k)))));
  const a = JSON.parse(want), b = JSON.parse(got), diff = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  assert.deepEqual(diff, [], "not transferred: " + diff.map(k => k + " A=" + JSON.stringify(a[k]).slice(0, 300) + " B=" + JSON.stringify(b[k]).slice(0, 300)).join("\n"));
  assert.deepEqual(B.page.errors, []);
  await B.ctx.close();
});

await test("Планшет и компьютер: свой вид на каждом устройстве, без лишнего меню", async () => {
  const cloud = makeCloud();
  const r = [];
  for (const [w, h] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    const { ctx, page } = await device(cloud, { viewport: { width: w, height: h } });
    r.push(await page.evaluate(() => ({ layout: document.body.dataset.layout, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth, synced: "viewMode" in state.settings })));
    await ctx.close();
  }
  assert.deepEqual(r.map(x => x.layout), ["mobile", "mobile", "desktop", "desktop"]);
  assert.ok(r.every(x => !x.wide && !x.synced), JSON.stringify(r));
});

// ================= V62 audit =================
await test("Безопасность: вредный текст в любом поле не выполняется", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(async () => {
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">"><svg onload="window.__xss=9">', now = new Date().toISOString(), k = keyDay();
    state.profile.name = X; state.goal.title = X; state.goal.why = X; state.goal.next = X; state.goal.milestones.forEach(m => m.title = X);
    state.tasks.push({ id: "x1", title: X, time: "23:00", date: k, createdAt: now }, { id: "x2", title: X, time: "", date: "2026-01-01", carriedFrom: X });
    state.habits = [{ id: "hx", title: X, kind: "daily", target: 7 }];
    state.notes.push({ id: "nx", title: X, body: X + "\n**" + X + "**", at: now, category: "personal" });
    state.budgets = [{ id: "bx", name: X, planned: 100, tops: [] }];
    state.expenses.push({ id: "ex", amount: 50, category: X, note: X, at: now, customCategory: X });
    state.profits.push({ id: "px", amount: 50, sourceGroup: X, note: X, at: now });
    state.goals.push({ id: "gx", title: X, description: X, icon: "target", color: "blue", target: 1000, createdAt: now });
    state.achievements.push({ id: "ax", text: X, at: now });
    state.reports[k] = { done: X, block: X, tomorrow: X, steps: {} };
    state.day.steps[0].title = X; state.day.steps[0].details = [X]; state.day.steps[0].text = X;
    state.notificationsLog.unshift({ id: "lx", title: X, body: X, kind: "tasks", at: now });
    state.ai.weekly = { [weekKey()]: { at: now, text: "СИЛЬНАЯ СТОРОНА — " + X } };
    saveState(); renderAll();
    for (const v of ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewProfile", "viewNotifications"]) { showView(v); document.querySelectorAll("[data-more]").forEach(b => b.getAttribute("aria-expanded") !== "true" && b.click()); }
    for (const op of [() => openLifeAnalysis(), () => openReportHistory(), () => openHabitEditor("hx"), () => openBankTopup("bx"), () => openMoveDevice(), () => openNoteEditor("nx"), () => openGoalEditor("gx"), () => openMoneyForm("expense", X), () => openSettings()]) { try { closeModal(); op(); } catch (e) { return "THROW " + e.message; } }
    await new Promise(r => setTimeout(r, 500));
    return window.__xss;
  });
  assert.equal(r, undefined, "script ran from user text: " + r);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Офлайн: записи сохраняются без интернета и уходят в облако после", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await sync(page);
  cloud.down = true;
  await page.evaluate(() => { state.expenses.push({ id: "off1", amount: 77, category: "Еда", at: new Date().toISOString() }); saveState(); });
  await page.evaluate(() => cloudAutoSync().catch(() => {}));
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.ok(await page.evaluate(() => state.expenses.some(x => x.id === "off1")), "lost offline record after reload");
  cloud.down = false;
  await sync(page);
  assert.ok(cloud.row.state.expenses.some(x => x.id === "off1"), "offline record never reached the cloud");
  await ctx.close();
});

// ================= V63 =================
await test("Деньги: смахнул влево — удалил, «Вернуть» возвращает", async () => {
  const { ctx, page } = await device(makeCloud(), { viewport: { width: 390, height: 844 } });
  await page.evaluate(() => { state.expenses.push({ id: "sw1", amount: 120, category: "Еда", at: new Date().toISOString() }); saveState(); renderAll(); showView("viewMoney"); });
  const row = page.locator('.jl-swipe[data-i="sw1"] .v-tx');
  await row.scrollIntoViewIfNeeded(); const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 20 - i * 20, box.y + box.height / 2);
  await page.mouse.up(); await page.waitForTimeout(350);
  assert.ok(await page.evaluate(() => document.querySelector('.jl-swipe[data-i="sw1"]').classList.contains("open")), "row did not open");
  await page.click('.jl-swipe[data-i="sw1"] [data-sw-del]'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => state.expenses.some(x => x.id === "sw1")), false, "not deleted");
  await page.click("#jlSnackUndo");
  assert.equal(await page.evaluate(() => state.expenses.some(x => x.id === "sw1")), true, "undo failed");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Банки: свой банк с эмодзи становится категорией расхода; календарь считает период", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(async () => {
    showView("viewMoney"); openBudget();
    document.querySelector('[data-emo="☕"]').click(); document.getElementById("budgetName").value = "Кофе"; document.getElementById("budgetPlanned").value = "300"; document.getElementById("saveBudgetBtn").click();
    const b = state.budgets.find(x => x.name === "Кофе");
    openMoneyForm("expense"); const opt = [...document.querySelectorAll("#moneyType option")].find(o => o.value === "Кофе")?.textContent; closeModal();
    const d = new Date(), k1 = keyDay(d); d.setDate(d.getDate() - 1); const k0 = keyDay(d);
    state.expenses.push({ id: "c1", amount: 40, category: "Кофе", categoryIcon: "☕", at: new Date().toISOString() }, { id: "c2", amount: 60, category: "Кофе", categoryIcon: "☕", at: new Date(Date.now() - 864e5).toISOString() });
    saveState(); renderMoney();
    moneyTab = "cal"; mcSetRange(k0, k1);
    return { emoji: b?.emoji, opt, noIdeas: !document.body.innerText.includes("Поездки · "), range: document.getElementById("mcRangeBox").innerText, left: limitInfo(b).remaining };
  });
  assert.equal(r.emoji, "☕"); assert.match(r.opt || "", /☕ Кофе/); assert.ok(r.noIdeas);
  assert.match(r.range, /Расход\s*100/); assert.equal(r.left, 200);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Цель: кольцо, отставание и живые этапы", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const main = state.goals.find(g => g.main); main.createdAt = new Date(Date.now() - 50 * 864e5).toISOString();
    const t = new Date(Date.now() + 50 * 864e5); state.goal.finance.targetAmount = 10000; state.goal.finance.targetDate = keyDay(t);
    state.goal.finance.contributions = [{ id: "c", amount: 1000, at: new Date().toISOString() }];
    state.goal.milestones[0].done = true; saveState(); renderAll(); showView("viewGoal");
    return { lag: document.getElementById("goalLag").textContent, hidden: document.getElementById("goalLag").hidden, steps: [...document.querySelectorAll(".jl-step")].map(x => x.className.replace("jl-step ", "")), ring: document.getElementById("goalRing").style.strokeDashoffset, chartOnMain: !document.getElementById("goalChart").closest(".jl-more") };
  });
  assert.equal(r.hidden, false); assert.match(r.lag, /Отстаёшь на/);
  assert.deepEqual(r.steps.slice(0, 2), ["done", "current"]); assert.ok(Number(r.ring) > 0); assert.ok(r.chartOnMain);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Безопасность: другой аккаунт на этом телефоне не видит чужие записи", async () => {
  const cloud = makeCloud();
  const A = await device(cloud);
  await A.page.evaluate(() => { state.expenses.push({ id: "own", amount: 50, category: "Еда", at: new Date().toISOString() }); saveState(); });
  await sync(A.page);
  // the phone still holds records of a different account (signed out without network)
  await A.page.evaluate(() => { localStorage.setItem("JL_DEVICE_OWNER_V64", "someone-else"); state.expenses.push({ id: "foreign", amount: 999, category: "Чужое", at: new Date().toISOString() }); state[CLOUD_BASE_KEY] = ""; saveState(); });
  await sync(A.page);
  const r = await A.page.evaluate(() => ({ ids: state.expenses.map(e => e.id), owner: localStorage.getItem("JL_DEVICE_OWNER_V64") }));
  assert.deepEqual(r.ids, ["own"], "foreign records leaked into the account");
  assert.equal(r.owner, UID);
  assert.ok(!JSON.stringify(cloud.row.state).includes("foreign"), "foreign records were uploaded");
  assert.deepEqual(A.page.errors, []);
  await A.ctx.close();
});

await test("Выход из аккаунта: телефон очищается, после входа всё возвращается", async () => {
  const cloud = makeCloud();
  const A = await device(cloud);
  await A.page.evaluate(() => { state.notes.push({ id: "secret", title: "Личное", body: "пин от домофона", at: new Date().toISOString(), category: "personal" }); saveState(); });
  await sync(A.page);
  await A.page.evaluate(() => { window.confirm = () => true; });
  // the test harness signs the page in again on reload; keep the cloud offline to see what the device itself kept
  cloud.down = true;
  await Promise.all([A.page.waitForEvent("load"), A.page.evaluate(() => cloudLogout())]);
  await A.page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true);
  await A.page.waitForTimeout(600);
  const after = await A.page.evaluate(() => ({ notes: state.notes.map(n => n.id), ls: Object.keys(localStorage).filter(k => (localStorage.getItem(k) || "").includes("пин от домофона")) }));
  assert.deepEqual(after.notes, [], "personal data stayed on the device after logout");
  assert.deepEqual(after.ls, []);
  cloud.down = false;
  await sync(A.page);
  const back = await A.page.evaluate(() => state.notes.map(n => n.id));
  assert.ok(back.includes("secret"), "data did not come back after login");
  await A.ctx.close();
});

await test("Сегодня: ритм дня этапами, задачи и привычки с живыми иконками", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-15T19:05:00+05:00") });
  const r = await page.evaluate(() => {
    const k = keyDay();
    state.tasks = [{ id: "a", title: "Позвонить в банк", date: k, time: "", createdAt: new Date().toISOString() }, { id: "b", title: "Купить хлеб", date: k, time: "", createdAt: new Date().toISOString() }];
    state.habits = [{ id: "h", title: "Пять намазов", kind: "daily", target: 7 }]; state.habitLog = {};
    saveState(); renderAll(); showView("viewToday");
    return { steps: [...document.querySelectorAll("#timeline .jl-rstep")].map(x => x.className.replace("jl-rstep ", "")), strip: document.querySelectorAll("#dayStrip .jl-seg").length,
      emo: document.querySelector('[data-task-emo="a"]').textContent, hemo: document.querySelector('[data-habit-emo="h"]').textContent, week: document.querySelectorAll("#habitWeek .jl-hw-col").length };
  });
  assert.deepEqual(r.steps, ["done", "current", "todo"]); assert.equal(r.strip, 3); assert.equal(r.emo, "📞"); assert.equal(r.hemo, "🕌"); assert.equal(r.week, 7);
  await page.click('[data-task-emo="a"]');
  await page.click('[data-habit-emo="h"]');
  const s = await page.evaluate(() => ({ done: state.tasks.find(t => t.id === "a").done, ring: document.querySelector("#taskRing b").textContent, habit: !!state.habitLog.h?.[keyDay()], hring: document.querySelector("#habitRing b").textContent }));
  assert.equal(s.done, true); assert.equal(s.ring, "50%"); assert.equal(s.habit, true); assert.equal(s.hring, "🏆");
  await page.click('[data-task-emo="b"]');
  assert.equal(await page.evaluate(() => document.querySelector("#taskRing b").textContent), "🏆");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Новый банк из стикеров без списка подсказок; новая цель с подсказками; верх «Сегодня» без лишней строки", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-15T11:00:00+05:00") });
  await page.evaluate(() => { showView("viewMoney"); openBudget(); });
  const f = await page.evaluate(() => ({ datalist: !!document.querySelector(".modal datalist, #budgetName[list]"), focused: document.activeElement?.id || "", n: document.querySelectorAll("[data-emo]").length }));
  assert.equal(f.datalist, false, "datalist flashes a text list on phones"); assert.notEqual(f.focused, "budgetName", "keyboard must not pop up on open"); assert.ok(f.n >= 20);
  await page.click('[data-emo="☕"]'); await page.click('[data-bank-sum="500"]');
  assert.equal(await page.inputValue("#budgetName"), "Кофе");
  await page.click("#saveBudgetBtn");
  assert.deepEqual(await page.evaluate(() => state.budgets.map(b => [b.emoji, b.name, b.planned])), [["☕", "Кофе", 500]]);
  await page.evaluate(() => openGoalEditor());
  await page.click('[data-ge-idea="1"]'); await page.click('[data-ge-sum="50000"]'); await page.click('[data-ge-months="12"]'); await page.click('[data-ge-color="green"]');
  const g = await page.evaluate(() => ({ title: document.getElementById("gePvTitle").textContent, monthly: document.getElementById("geMonthly").textContent, date: document.getElementById("geDate").value }));
  assert.equal(g.title, "Машина"); assert.match(g.monthly, /в месяц/); assert.equal(g.date, "2027-10-15");
  await page.click("#geSave");
  const saved = await page.evaluate(() => state.goals.find(x => x.title === "Машина"));
  assert.ok(saved && saved.icon === "car" && saved.color === "green" && saved.targetAmount === 50000);
  const h = await page.evaluate(() => { showView("viewToday"); renderToday(); return { now: document.getElementById("currentAction").textContent, quote: document.getElementById("motivationText").textContent, details: document.getElementById("currentDetails").children.length }; });
  assert.match(h.now, /Работа/); assert.ok(!/Сегодня:/.test(h.quote), "quote must not carry the task line"); assert.equal(h.details, 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Шрифт выбирается в настройках и сохраняется; звук Jamal Glass загружается", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(async () => {
    const def = document.documentElement.dataset.font;
    showView("viewSettings");
    const sel = document.getElementById("setFont"); sel.value = "nunito"; sel.dispatchEvent(new Event("change"));
    const after = document.documentElement.dataset.font, saved = state.settings.font;
    const loaded = await document.fonts.load('16px "Nunito"', "Привет").then(f => f.length > 0);
    const res = await fetch("sounds/jamal-glass.wav"); const buf = await res.arrayBuffer();
    return { def, after, saved, loaded, wav: res.ok && buf.byteLength > 100000 };
  });
  assert.deepEqual(r, { def: "manrope", after: "nunito", saved: "nunito", loaded: true, wav: true });
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.font + "|" + state.settings.font), "nunito|nunito");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Долг: ячейки открывают историю; формы денег живые; этапы цели закрываются сами", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    state.debts = { bank: 100000, firms: 100000, monthlyPayment: 4000 }; state.debtBaseline = 200000;
    state.expenses.push({ id: "dp1", amount: 4000, category: "Долг", debtPayment: "bank", at: new Date().toISOString() });
    saveState(); renderAll(); showView("viewMoney");
    document.querySelector('[data-debt-open="bank"]').click();
    const hist = { title: document.querySelector(".modal h2")?.textContent, pays: document.querySelectorAll(".jl-dh-row.pay").length };
    closeModal();
    openMoneyForm("profit");
    const a = document.getElementById("moneyAmount"); a.value = "1500"; a.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-src-pick="Фриланс"]').click();
    document.querySelector('[data-day-pick]:nth-child(2)').click();
    const rc = { sumNode: !!document.getElementById("rcSum"), ico: document.getElementById("rcIco").textContent, what: document.getElementById("rcWhat").textContent, date: document.getElementById("rcDate").textContent, type: document.getElementById("moneyType").value };
    closeModal();
    state.goal.milestones = [{ id: "m1", title: "Закрыть основную часть долгов", done: false }, { id: "m2", title: "Создать резерв", done: false }];
    state.debts = { bank: 50000, firms: 40000, monthlyPayment: 4000 }; saveState(); renderAll(); showView("viewGoal");
    return { hist, rc, ms: state.goal.milestones.map(m => [m.done, !!m.auto]) };
  });
  assert.equal(r.hist.title, "Банк"); assert.equal(r.hist.pays, 1);
  assert.ok(r.rc.sumNode); assert.equal(r.rc.type, "Фриланс"); assert.equal(r.rc.what, "Фриланс"); assert.equal(r.rc.date, "вчера");
  assert.deepEqual(r.ms, [[true, true], [false, false]]);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("AI-разбор жизни: шлёт цифры приложения и показывает блоки плюсов и минусов", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await page.evaluate(() => openGeminiAnalysis());
  const opened = await page.evaluate(() => !!document.getElementById("aiRunBtn"));
  if (opened) {
    await page.click("#aiRunBtn");
    await page.waitForFunction(() => document.querySelector("#aiResult .analysis-item"), null, { timeout: 8000 });
    const body = cloud.aiBodies.at(-1);
    assert.ok(body.facts && typeof body.facts === "object" && "cats" in body.facts, "life analysis must send the app's own numbers");
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("AI: разбор понимает markdown и нумерацию; при лимите 429 — понятная причина и разбор без AI", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  const parsed = await page.evaluate(() => {
    const heads = t => { const d = document.createElement("div"); d.innerHTML = aiTextHtml(t); return [...d.querySelectorAll(".jl-ai-sec")].map(x => [x.querySelector("b")?.textContent || "", x.querySelector("div")?.textContent || ""]); };
    return {
      caps: heads("ПЛЮСЫ — доход 9 000\nМИНУСЫ — кафе 1 200"),
      md: heads("## Плюсы\n* доход 9 000\n### Минусы:\n- кафе 1 200"),
      bold: heads("**Плюсы:** доход 9 000\n**МИНУСЫ** — кафе 1 200"),
      num: heads("1. ПЛЮСЫ\nдоход 9 000\n2) МИНУСЫ:\nкафе 1 200"),
    };
  });
  for (const [k, v] of Object.entries(parsed)) {
    assert.equal(v.length, 2, k + " " + JSON.stringify(v));
    assert.match(v[0][0], /Плюсы$/, k); assert.match(v[1][0], /Минусы$/, k);
    assert.match(v[0][1], /доход 9 000/, k); assert.match(v[1][1], /кафе 1 200/, k);
    assert.ok(!/[*#]/.test(JSON.stringify(v)), k + " keeps markdown: " + JSON.stringify(v));
  }
  cloud.aiFail = true;
  await page.evaluate(() => openGeminiAnalysis());
  await page.click("#aiRunBtn");
  await page.waitForSelector("#aiResult .jl-ai-fail", { timeout: 8000 });
  assert.match(await page.textContent("#aiResult"), /лимит Gemini/);
  await page.click("#localFallbackBtn");
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open") && document.getElementById("modal").textContent.length > 50), "local analysis did not open");
  await page.evaluate(() => { closeModal(); showView("viewToday"); renderWeek(); });
  if (await page.evaluate(() => !!document.getElementById("wkRun"))) {
    await page.evaluate(() => runWeekReview());
    const wk = await page.textContent("#wkText");
    assert.match(wk, /лимит Gemini/); assert.ok(wk.length > 60, "week card must keep the review without AI: " + wk);
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Клавиатура: столбики долга и цитата открываются Enter/Space; axe без нарушений", async () => {
  const { ctx, page } = await device(makeCloud());
  const AXE = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  // quote on Today
  await page.evaluate(() => showView("viewToday"));
  await page.focus(".jl-quote");
  assert.equal(await page.getAttribute(".jl-quote", "aria-expanded"), "false");
  await page.keyboard.press("Enter");
  assert.equal(await page.getAttribute(".jl-quote", "aria-expanded"), "true");
  await page.keyboard.press(" ");
  assert.equal(await page.getAttribute(".jl-quote", "aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.querySelector(".jl-quote").classList.contains("open")), false);
  // debt bars on Money
  await page.evaluate(() => { state.debts = { bank: 9000, firms: 1000, monthlyPayment: 500 }; ensureDebtHistory(); saveState(); showView("viewMoney"); renderAll(); });
  await page.waitForSelector("#debtChart [data-debt-open]");
  for (const key of ["Enter", " "]) {
    await page.focus("#debtChart [data-debt-open]");
    await page.keyboard.press(key);
    assert.ok(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open")), "debt history did not open with " + JSON.stringify(key));
    await page.evaluate(() => closeModal());
  }
  await page.addScriptTag({ content: AXE });
  const run = sel => page.evaluate(sel => axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"], rules: { "color-contrast": { enabled: false } } }).then(r => r.violations.map(v => v.id + ": " + v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", "))), sel);
  assert.deepEqual(await run("#debtChart"), []);
  await page.evaluate(() => showView("viewToday"));
  assert.deepEqual(await run(".jl-quote"), []);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Светлая тема: новые компоненты читаются (контраст ≥ 4.5:1)", async () => {
  const { ctx, page } = await device(makeCloud());
  const AXE = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  await page.addScriptTag({ content: AXE });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const now = new Date().toISOString();
    state.debts = { bank: 90000, firms: 10000, monthlyPayment: 4500 }; ensureDebtHistory();
    state.expenses.push({ id: "dp", amount: 4000, category: "Долг", debtPayment: true, at: now });
    state.goal.target = 50000; state.goal.milestones.forEach((m, i) => { m.done = i === 0; });
    state.ai.history.unshift({ id: "ah", at: now, scope: {}, result: "ПЛЮСЫ — доход 9 000\nМИНУСЫ — кафе 1 200\nШАГ НА СЕГОДНЯ — записать траты", sources: [] });
    saveState(); renderAll();
  });
  const bad = [];
  const check = async (name, sel) => {
    await page.waitForSelector(sel, { timeout: 4000 }); await page.waitForTimeout(250);
    const v = await page.evaluate(sel => axe.run(sel, { runOnly: ["color-contrast"] }).then(r => r.violations.flatMap(v => v.nodes.map(n => n.target.join(" ") + " " + (n.any[0]?.data?.contrastRatio ?? "")))), sel);
    const th = await page.evaluate(() => document.documentElement.dataset.theme);
    bad.push(...v.map(x => th + " " + name + ": " + x));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${await page.evaluate(() => document.documentElement.dataset.theme)}.png`) });
  };
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => { state.settings.theme = t; setTheme(); closeModal(); }, theme);
    await page.evaluate(() => openMoneyForm("expense")); await check("receipt-expense", ".jl-receipt");
    await page.evaluate(() => { closeModal(); openMoneyForm("profit"); }); await check("receipt-profit", ".modal .stack, #modal");
    await check("src-tiles", ".jl-src-tiles");
    await page.evaluate(() => { closeModal(); openDebtHistory("bank"); }); await check("debt-history", "#modal");
    await page.evaluate(() => { closeModal(); openBudget(); }); await check("stickers", ".jl-stickers");
    await page.evaluate(() => { closeModal(); showView("viewGoal"); renderGoal(); }); await check("goal-milestones", "#milestones");
    await page.evaluate(() => { const d = document.createElement("div"); d.id = "aiProbe"; d.className = "analysis-item jl-ai-result"; d.innerHTML = aiTextHtml(state.ai.history[0].result); document.getElementById("milestones").after(d); d.scrollIntoView(); });
    await check("ai-cards", "#aiProbe"); await page.evaluate(() => document.getElementById("aiProbe").remove());
  }
  if (bad.length) console.log(bad.join("\n"));
  assert.deepEqual(bad, [], bad.join("\n"));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await browser.close(); server.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
