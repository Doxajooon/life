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
    // 74.6: delete_my_account — removes the user's cloud rows (signed-in users only)
    if (url.pathname === "/rest/v1/rpc/delete_my_account") {
      if (!ok(req.headers().authorization)) return send(401, { message: "JWT expired" });
      cloud.deleted = true; cloud.row = null; return route.fulfill({ status: 204, headers: cors });
    }
    // V72: daily cloud copies (life_state_history): one row per user and day, own rows only
    if (url.pathname === "/rest/v1/life_state_history") {
      if (m === "OPTIONS") return route.fulfill({ status: 200, headers: { ...cors, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      if (!ok(req.headers().authorization)) return send(401, { message: "JWT expired" });
      if (cloud.noHistory) return send(404, { code: "PGRST205", message: "relation not found" });
      const H = cloud.history = cloud.history || [], q = url.searchParams, val = k => (q.get(k) || "").replace(/^(eq|lt)\./, "");
      if (m === "POST") { const b = JSON.parse(req.postData() || "{}"); if (b.user_id !== UID) return send(403, { message: "RLS" });
        if (!H.some(r => r.user_id === b.user_id && r.day === b.day)) H.push({ id: "h" + (cloud.hseq = (cloud.hseq || 0) + 1), ...b, created_at: new Date().toISOString() }); return send(201, null); }
      if (m === "DELETE") { const before = H.length; cloud.history = H.filter(r => !(r.user_id === val("user_id") && q.get("day")?.startsWith("lt.") && r.day < val("day"))); cloud.deleted = (cloud.deleted || 0) + before - cloud.history.length; return send(204, null); }
      if (m === "GET") { let rows = H.filter(r => r.user_id === UID); if (q.get("id")) rows = rows.filter(r => r.id === val("id")); rows = [...rows].sort((a, b) => b.day.localeCompare(a.day));
        const sel = (q.get("select") || "").split(","); return send(200, rows.map(r => Object.fromEntries(sel.map(k => [k, r[k]])))); }
    }
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
      const b = JSON.parse(req.postData() || "{}"); cloud.aiBodies = [...(cloud.aiBodies || []), b]; cloud.rowAtAI = cloud.row ? JSON.parse(JSON.stringify(cloud.row.state)) : null;
      if (cloud.aiDelay) await new Promise(r => setTimeout(r, cloud.aiDelay));
      if (cloud.aiReply === "abort") return route.abort("connectionreset");
      // 74.5: Google busy for a few calls in a row (503 «high demand» or the 19-second time limit)
      if (cloud.aiSeq?.length) { const x = cloud.aiSeq.shift(); return send(503, { error: "Google сейчас перегружен — все модели Gemini заняты. Попробуй через минуту.", reason: x === "timeout" ? "gemini_timeout" : "gemini_overloaded" }); }
      if (!cloud.aiReply && !cloud.aiFail) cloud.aiOk = (cloud.aiOk || 0) + 1; // the server counts only real answers (ai_usage)
      if (cloud.aiReply) return route.fulfill({ status: cloud.aiReply.status, headers: cors, contentType: cloud.aiReply.type || "application/json", body: cloud.aiReply.body });
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
        if (sel.includes("device_id")) r.device_id = cloud.row.device_id ?? null;
        // 74.1: a slow download of the full state (the user keeps typing meanwhile)
        if (sel.includes("state") && cloud.stateDelay) { await new Promise(res => setTimeout(res, cloud.stateDelay)); return send(200, [r]).catch(() => {}); }
        return send(200, [r]);
      }
      const body = JSON.parse(req.postData() || "{}");
      if (m === "POST") { cloud.row = { ...body, updated_at: cloud.nextStamp() };
        // the row is written at once, the answer comes late (a slow phone that is closed before it arrives)
        if (cloud.postDelay) { const row = cloud.row; await new Promise(r => setTimeout(r, cloud.postDelay)); return send(201, [row]).catch(() => {}); }
        return send(201, [cloud.row]); }
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
async function device(cloud, { viewport = { width: 390, height: 844 }, session, sw = "block", init, clock, touch = false, onboarding = false } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: sw, locale: "ru-RU", timezoneId: "Asia/Dushanbe", hasTouch: touch, isMobile: touch });
  await ctx.route(/supabase\.co/, r => cloud.handle(r));
  if (session !== null) {
    const s = session || cloud.session();
    await ctx.addInitScript(a => { if (!localStorage.getItem("LIFE_CONTROL_SUPABASE_AUTH_V1")) localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); }, JSON.stringify(s));
  }
  // 73: the first-start setup opens for an empty account; tests that are not about it start as «already set up»
  if (!onboarding) await ctx.addInitScript(() => { if (!localStorage.getItem("LIFE_CONTROL_V52")) localStorage.setItem("LIFE_CONTROL_V52", JSON.stringify({ version: 58, settings: { onboarded: true } })); });
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
// 73: a new account starts with an empty goal — tests about goal stages set up a goal of their own (made-up values)
const seedGoal = () => { state.goal.title = "Купить квартиру"; state.goal.why = "Своё жильё"; state.goal.next = "Накопить первый взнос";
  state.goal.milestones = [{ id: "m1", title: "Накопить первый взнос", done: false }, { id: "m2", title: "Закрыть кредит за машину", done: false }, { id: "m3", title: "Выбрать район", done: false }, { id: "m4", title: "Оформить ипотеку", done: false }];
  syncMainGoalMirror(); saveState(); renderAll(); };
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

// 74.1: the dirty flag was read before the download; an edit made while the other device's copy was downloading was overwritten by it
await test("Правка во время скачивания чужих изменений не теряется", async () => {
  const cloud = makeCloud();
  const A = await device(cloud), B = await device(cloud);
  await sync(A.page); await sync(B.page); await sync(A.page);
  await B.page.evaluate(() => { state.notes.push({ id: "b1", title: "с телефона", body: "", at: new Date().toISOString() }); saveState(); });
  await sync(B.page);
  cloud.stateDelay = 600;
  await A.page.evaluate(async () => {
    while (cloudSyncInFlight) await cloudSyncInFlight.catch(() => {});
    const p = cloudAutoSync();                         // A sees B's change and downloads it…
    await new Promise(r => setTimeout(r, 200));
    state.expenses.push({ id: "a1", amount: 10, category: "Еда", at: new Date().toISOString() }); saveState();
    state.notes.push({ id: "a2", title: "с ПК", body: "", at: new Date().toISOString() }); saveState();
    await p;
  });
  cloud.stateDelay = 0;
  await sync(A.page); await sync(B.page);
  for (const [name, d] of [["A", A], ["B", B]]) {
    const s = await d.page.evaluate(() => ({ e: state.expenses.map(x => x.id), n: state.notes.map(x => x.id) }));
    assert.ok(s.e.includes("a1") && s.n.includes("a2") && s.n.includes("b1"), name + " lost data: " + JSON.stringify(s));
  }
  assert.ok(cloud.row.state.notes.some(n => n.id === "a2") && cloud.row.state.expenses.some(x => x.id === "a1"), "edit not uploaded");
  await A.ctx.close(); await B.ctx.close();
});

// 74.1: right after a restart (before the first sync) edits were not marked as unsent and the cloud copy replaced them
await test("Правка сразу после перезапуска, до первой синхронизации, не теряется", async () => {
  const cloud = makeCloud();
  const A = await device(cloud), B = await device(cloud);
  await sync(A.page); await sync(B.page); await sync(A.page);
  await B.page.evaluate(() => { state.notes.push({ id: "b1", title: "с телефона", body: "", at: new Date().toISOString() }); saveState(); });
  await sync(B.page);
  cloud.stateDelay = 800;
  await A.page.reload(); await A.page.waitForFunction(() => appReadyForSync === true);
  await A.page.evaluate(() => { state.notes.push({ id: "a9", title: "сразу после запуска", body: "", at: new Date().toISOString() }); saveState(); });
  await A.page.evaluate(async () => { while (cloudSyncInFlight) await cloudSyncInFlight.catch(() => {}); });
  cloud.stateDelay = 0;
  await sync(A.page); await sync(B.page);
  for (const [name, d] of [["A", A], ["B", B]]) {
    const n = await d.page.evaluate(() => state.notes.map(x => x.id));
    assert.ok(n.includes("a9") && n.includes("b1"), name + " lost data: " + JSON.stringify(n));
  }
  await A.ctx.close(); await B.ctx.close();
});

await test("74.3: данные, сохранённые на устройстве без отметки «не отправлено», всё равно уходят в облако при запуске", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await sync(page);
  assert.ok(cloud.row, "first upload");
  // the 20.10 phone: a record lands in the local copy (an old build, a save before the sync was ready) and the «unsent» mark is missing
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("LIFE_CONTROL_V52")); s.notes.push({ id: "lost1", title: "только на телефоне", body: "", at: new Date().toISOString() });
    s.reports = { ...(s.reports || {}), "2026-10-19": { done: "итог с телефона", block: "", future: "", tomorrow: "", savedAt: new Date().toISOString(), steps: {} } };
    s._lastSavedAt = new Date(Date.now() + 60000).toISOString(); localStorage.setItem("LIFE_CONTROL_V52", JSON.stringify(s)); localStorage.removeItem("LIFE_CONTROL_CLOUD_DIRTY_V1"); });
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.ok(await page.evaluate(() => state.notes.some(n => n.id === "lost1")), "the local copy was not loaded");
  await page.evaluate(async () => { while (cloudSyncInFlight) await cloudSyncInFlight.catch(() => {}); });
  await sync(page);
  assert.ok(cloud.row.state.notes.some(n => n.id === "lost1"), "the record stayed on the device: " + JSON.stringify(cloud.row.state.notes.map(n => n.id)));
  assert.equal(cloud.row.state.reports["2026-10-19"]?.done, "итог с телефона");
  // nothing changed after that: the next syncs only ask for the version, no more uploads
  const pushes = () => cloud.hits.filter(h => /^(POST|PATCH) \/rest\/v1\/life_state$/.test(h)).length, before = pushes();
  await sync(page); await sync(page); await page.reload(); await page.waitForFunction(() => appReadyForSync === true); await sync(page);
  assert.equal(pushes(), before, "uploads with no change: " + (pushes() - before));
  await ctx.close();
});

await test("74.4: перед AI свежие правки уходят в облако — AI читает их", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await sync(page);
  await page.evaluate(async () => { state.notes.push({ id: "fresh1", title: "только что", body: "", at: new Date().toISOString() }); saveState(); await callAI({ mode: "life" }).catch(() => {}); });
  assert.ok(cloud.rowAtAI?.notes?.some(n => n.id === "fresh1"), "AI read an old copy: " + JSON.stringify(cloud.rowAtAI?.notes?.map(n => n.id)));
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
    // best of three: one garbage-collection pause or a cold JIT must not fail the test, a real slowdown still does
    const render = [], save = [];
    for (let i = 0; i < 3; i++) { const a = performance.now(); renderAll(); const b = performance.now(); saveState(); const c = performance.now(); render.push(b - a); save.push(c - b); }
    return { render: Math.min(...render), save: Math.min(...save), all: render.map(x => Math.round(x)) + " / " + save.map(x => Math.round(x)) };
  });
  const slow = Math.max(1, Number(process.env.CPU_SLOW) || 1) ** 0.5; // a 4× slower CPU gets 2× the budget
  if (process.env.PERF_LOG) console.log("   load render/save ms:", t.all);
  assert.ok(t.render < 600 * slow, "render " + t.render.toFixed(0) + " ms (" + t.all + ")");
  assert.ok(t.save < 200 * slow, "save " + t.save.toFixed(0) + " ms (" + t.all + ")");
  // every screen opens quickly with this much data (best of two)
  const scr = await page.evaluate(() => { const out = {}; for (const v of ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewProfile"]) { const ms = []; for (let i = 0; i < 2; i++) { showView("viewDisplay"); const a = performance.now(); showView(v); ms.push(performance.now() - a); } out[v] = Math.round(Math.min(...ms)); }
    for (const t of ["tx", "cal", "overview"]) { const ms = []; for (let i = 0; i < 2; i++) { document.querySelector(`[data-money-tab="${t === "overview" ? "tx" : "overview"}"]`).click(); const a = performance.now(); document.querySelector(`[data-money-tab="${t}"]`).click(); ms.push(performance.now() - a); } out["money/" + t] = Math.round(Math.min(...ms)); }
    const a = performance.now(); openSearch(); const q = document.querySelector("#modal input"); q.value = "Еда"; q.dispatchEvent(new Event("input", { bubbles: true })); out.search = Math.round(performance.now() - a); closeModal(); return out; });
  if (process.env.PERF_LOG) console.log("   screens ms:", JSON.stringify(scr));
  // V72 D13: every screen and tab opens in ≤ 150 ms even on a 4× slower phone
  for (const [k, v] of Object.entries(scr)) assert.ok(v <= 150, `${k} opens in ${v} ms with 3000 operations and 500 notes (limit 150 ms)`);
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
  await page.evaluate(seedGoal);
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
    for (const op of [() => openLifeAnalysis(), () => openReportHistory(), () => openHabitEditor("hx"), () => openBankTopup("bx"), () => openNoteEditor("nx"), () => openGoalEditor("gx"), () => openMoneyForm("expense", X), () => openSettings()]) { try { closeModal(); op(); } catch (e) { return "THROW " + e.message; } }
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
  await page.evaluate(seedGoal);
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

await test("74.6: политика конфиденциальности читается; удаление аккаунта — по слову «УДАЛИТЬ», стирает облако и телефон, без сети ничего не теряет", async () => {
  const cloud = makeCloud();
  const A = await device(cloud);
  await A.page.evaluate(() => { state.notes.push({ id: "secret", title: "Личное", body: "пин от домофона", at: new Date().toISOString(), category: "personal" }); saveState(); showView("viewProfile"); });
  await sync(A.page);
  // the policy opens from the profile and says how to delete the data
  await A.page.click("#pfPrivacy");
  const pol = await A.page.evaluate(() => document.getElementById("modal").innerText);
  assert.ok(/Политика конфиденциальности/.test(pol) && /Google Gemini/.test(pol) && /Удалить аккаунт и данные/.test(pol), "the policy is not readable");
  await A.page.click("#closeModalBtn");
  // the confirmation word is required
  await A.page.click("#pfDeleteAccount");
  assert.equal(await A.page.evaluate(() => document.getElementById("delGo").disabled), true, "delete must be locked until the word is typed");
  await A.page.fill("#delConfirm", "нет");
  assert.equal(await A.page.evaluate(() => document.getElementById("delGo").disabled), true);
  // no network: nothing is deleted, nothing is lost, the reason is shown
  cloud.down = true;
  await A.page.fill("#delConfirm", "удалить");
  assert.equal(await A.page.evaluate(() => document.getElementById("delGo").disabled), false);
  await A.page.click("#delGo");
  await A.page.waitForFunction(() => /Нет сети|Не удалось/.test(document.getElementById("delMsg").textContent));
  assert.ok(!cloud.deleted && await A.page.evaluate(() => state.notes.some(n => n.id === "secret") && !!cloudAuth()), "offline delete must change nothing");
  // online: the account is deleted, the phone is wiped, the user is signed out
  cloud.down = false;
  await Promise.all([A.page.waitForEvent("load"), A.page.click("#delGo")]);
  assert.ok(cloud.deleted && cloud.row === null, "the cloud account was not deleted");
  const after = await A.page.evaluate(() => ({ ls: Object.keys(localStorage).filter(k => (localStorage.getItem(k) || "").includes("пин от домофона")), auth: localStorage.getItem("LIFE_CONTROL_AUTH") }));
  assert.deepEqual(after.ls, [], "personal data stayed on the device after deleting the account");
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

await test("Шрифт выбирается в настройках и сохраняется; звук Jamal Dawn загружается", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(async () => {
    const def = document.documentElement.dataset.font;
    showView("viewSettings");
    const sel = document.getElementById("setFont"); sel.value = "nunito"; sel.dispatchEvent(new Event("change"));
    const after = document.documentElement.dataset.font, saved = state.settings.font;
    const loaded = await document.fonts.load('16px "Nunito"', "Привет").then(f => f.length > 0);
    const res = await fetch("sounds/jamal-dawn.wav"); const buf = await res.arrayBuffer();
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
  await page.evaluate(seedGoal);
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
  assert.equal(r.hist.title, "Долг 1"); // a new account: neutral debt names assert.equal(r.hist.pays, 1);
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
    await page.evaluate(() => { showView("viewToday"); renderWeek(); document.getElementById("weekCard").scrollIntoView(); }); await check("week-card", "#weekCard");
  }
  if (bad.length) console.log(bad.join("\n"));
  assert.deepEqual(bad, [], bad.join("\n"));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Деньги: платёж по долгу не входит в «Расход», показан отдельной строкой", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const r = await page.evaluate(async () => {
    const now = new Date().toISOString(), k = keyDay();
    state.income = 9000; state.debts = { bank: 90000, firms: 10000, monthlyPayment: 4500 };
    state.expenses.push({ id: "e300", amount: 300, category: "Еда", at: now, dateKey: k }, { id: "d4000", amount: 4000, category: "Долг", debtPayment: "bank", at: now, dateKey: k });
    saveState(); showView("viewToday"); renderAll(); await new Promise(r => setTimeout(r, 1500));
    const n = id => (document.getElementById(id)?.title || document.getElementById(id)?.textContent || "").replace(/\s/g, " ");
    const line = id => { const el = document.getElementById(id); return el && !el.hidden ? el.textContent.replace(/\s/g, " ") : ""; };
    const today = { exp: n("tmExpense"), line: line("tmDebtPay") };
    showView("viewMoney"); renderAll(); await new Promise(r => setTimeout(r, 1500));
    const overview = { exp: n("mvExpense"), line: line("mvDebtPay") };
    document.querySelector('[data-money-tab="cal"]')?.click(); renderMoneyCalendar();
    const cal = { exp: document.getElementById("mcExpense").title.replace(/\s/g, " "), line: line("mcDebtPay") };
    // old financial calendar: selected day and period
    closeModal(); openCalendar();
    const meta = document.querySelector(".calendar-selected .meta").textContent.replace(/\s/g, " ");
    const rangeBox = document.querySelector(".calendar-range-summary").textContent.replace(/\s/g, " ");
    const day = { exp: meta, line: line("calDayDebtPay") }, period = { exp: rangeBox, line: line("calRangeDebtPay"), net: calendarRangeMetrics(keyDay(), keyDay()).net };
    closeModal();
    // week card and the hint in the debt plan
    showView("viewToday"); renderWeek(); renderDebtPlan();
    const week = { exp: document.getElementById("wkExpense").textContent.replace(/\s/g, " "), line: line("wkDebtPay"), stats: weekStats(), local: localWeekText() };
    const hint = document.getElementById("dpLeft")?.textContent.replace(/\s/g, " ") || "";
    const a = analyzeLife(); return { today, overview, cal, day, period, week, hint, analysis: a.spend ?? a.month?.spend ?? a };
  });
  assert.match(r.day.exp, /Расход: −300 /, "calendar day: " + JSON.stringify(r.day));
  assert.match(r.period.exp, /Потрачено−300 /, "calendar period: " + JSON.stringify(r.period));
  assert.match(r.period.exp, /Чистый итог−4 300 /, "net still pays the debt: " + JSON.stringify(r.period));
  assert.equal(r.period.net, -4300);
  for (const [k, v] of Object.entries({ day: r.day, period: r.period, week: r.week })) assert.match(v.line, /Платежи по долгу: 4 000/, k + " " + JSON.stringify(v));
  assert.equal(r.week.exp, "−300", "week card: " + JSON.stringify(r.week));
  assert.equal(r.week.stats.out, 300); assert.equal(r.week.stats.debt, 4000);
  assert.ok(!/4 300/.test(r.week.local), "week review without AI: " + r.week.local);
  assert.match(r.hint, /обычно тратишь 300 /, "debt plan hint: " + r.hint);
  for (const [k, v] of Object.entries({ today: r.today, overview: r.overview, cal: r.cal })) {
    assert.match(v.exp, /^300\b/, k + " «Расход» must be 300: " + JSON.stringify(v));
    assert.match(v.line, /Платежи по долгу: 4 000/, k + " " + JSON.stringify(v));
  }
  assert.equal(r.analysis, 300);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Цель: автоэтапы — переключатель в «Изменить цель» и ручное снятие", async () => {
  const { ctx, page } = await device(makeCloud());
  // the stage «закрыть основную часть долгов» closes itself once half the debt is paid
  const setup = () => page.evaluate(() => {
    state.debtBaseline = 100000; state.debts = { bank: 90000, firms: 0, monthlyPayment: 1000 }; // not yet half paid
    state.goal.milestones = [{ id: "m1", title: "Закрыть основную часть долгов", done: false }, { id: "m2", title: "Купить машину", done: false }];
    saveState();
  });
  // 1) switch off in the editor → the stage stays open
  await setup();
  await page.evaluate(() => { showView("viewGoal"); openGoalEdit(); });
  assert.equal(await page.isChecked('[data-ms-auto="m1"]'), true, "auto-close is on by default");
  await page.$eval('[data-ms-auto="m1"]', el => el.click());
  await page.evaluate(() => { closeModal(); state.debts.bank = 40000; saveState(); autoMilestones(); renderGoal(); }); // now 60% paid
  let m1 = await page.evaluate(() => state.goal.milestones[0]);
  assert.equal(m1.autoOff, true, "switch off: " + JSON.stringify(m1)); assert.equal(m1.done, false, "a stage with auto-close off must not close itself: " + JSON.stringify(m1));
  // switched back on → closes by the numbers
  await page.evaluate(() => openGoalEdit());
  await page.$eval('[data-ms-auto="m1"]', el => el.click());
  m1 = await page.evaluate(() => { closeModal(); return state.goal.milestones[0]; });
  assert.equal(m1.done, true, "switch on: " + JSON.stringify(m1)); assert.equal(m1.auto, true); assert.ok(!("autoOff" in m1));
  // 2) an auto-closed stage unticked by hand stays open for good
  await page.evaluate(() => { showView("viewGoal"); renderGoal(); });
  await page.$eval('[data-ms="m1"]', el => el.click());
  m1 = await page.evaluate(() => { autoMilestones(); renderAll(); return state.goal.milestones[0]; });
  assert.equal(m1.done, false, "unticked by hand: " + JSON.stringify(m1)); assert.equal(m1.autoOff, true);
  // editing the stage list in the textarea keeps the flag
  await page.evaluate(() => openGoalEdit());
  await page.fill("#gMilestones", "[ ] Закрыть основную часть долгов\n[ ] Купить машину\n[ ] Новый этап");
  m1 = await page.evaluate(() => { closeModal(); return state.goal.milestones; });
  assert.equal(m1[0].autoOff, true); assert.equal(m1.length, 3); assert.equal(m1[2].autoOff, undefined);
  // 3) old data without the new fields works and is normalized
  const old = await page.evaluate(() => { const s = clone(state); s.goal.milestones = [{ id: "o1", title: "Старый этап", done: true }, { id: "o2", title: "Ещё", done: false, autoOff: "x" }]; const n = normalize(s); return n.goal.milestones; });
  assert.equal(old[0].done, true); assert.ok(!("autoOff" in old[1]));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Деньги: тап по строке операции открывает изменение (обзор, транзакции, календарь, поиск)", async () => {
  const { ctx, page } = await device(makeCloud(), { touch: true });
  await page.evaluate(() => { const now = new Date().toISOString(), k = keyDay();
    state.expenses.push({ id: "tapE", amount: 300, category: "Еда", at: now, dateKey: k }); state.profits.push({ id: "tapP", amount: 900, sourceGroup: "Фриланс", at: now, dateKey: k });
    saveState(); showView("viewMoney"); renderAll(); });
  const opened = async (where, sel) => {
    await page.waitForSelector(sel, { state: "visible", timeout: 4000 });
    await page.tap(sel);
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => ({ open: document.getElementById("modalBack").classList.contains("open"), amount: document.getElementById("moneyAmount")?.value || "" }));
    assert.ok(r.open && r.amount === "300", where + ": tap did not open the edit form " + JSON.stringify(r));
    await page.evaluate(() => closeModal());
  };
  await opened("overview", '#mvRecent [data-tx-id="tapE"]');
  await page.evaluate(() => document.querySelector('[data-money-tab="tx"]').click());
  await opened("transactions", '#txList [data-tx-id="tapE"]');
  await page.evaluate(() => document.querySelector('[data-money-tab="cal"]').click());
  await opened("calendar", '#mcDayList [data-tx-id="tapE"]');
  // a real finger drifts a little during a tap (Chrome on Android still counts up to ~15 px as a tap)
  const cdp = await ctx.newCDPSession(page);
  for (const [dx, dy] of [[11, 2], [-12, 3], [4, 9]]) {
    const b = await page.locator('#mcDayList [data-tx-id="tapE"]').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx / 2, y: y + dy / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ open: document.getElementById("modalBack").classList.contains("open"), amount: document.getElementById("moneyAmount")?.value || "", rowOpen: !!document.querySelector(".jl-swipe.open") }));
    assert.ok(r.open && r.amount === "300", `tap with ${dx},${dy} px drift did not open the edit form ` + JSON.stringify(r));
    await page.evaluate(() => closeModal());
  }
  // a real swipe still opens the actions instead of the form
  { const b = await page.locator('#mcDayList [data-tx-id="tapE"]').boundingBox(), x = b.x + b.width - 30, y = b.y + b.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - i * 25, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ modal: document.getElementById("modalBack").classList.contains("open"), rowOpen: !!document.querySelector(".jl-swipe.open") }));
    assert.deepEqual(r, { modal: false, rowOpen: true }, "swipe left must reveal the actions"); }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Окна: «назад» (Android/браузер) и Esc закрывают окно, не уходя с экрана", async () => {
  const { ctx, page } = await device(makeCloud());
  const st = () => page.evaluate(() => ({ modal: document.getElementById("modalBack").classList.contains("open"), view: currentView }));
  // Android: the back key only works while the WebView has history; a fresh start has none
  const len0 = await page.evaluate(() => history.length);
  await page.evaluate(() => openMoneyForm("expense"));
  assert.ok(await page.evaluate(() => history.length) > len0, "an open window must give «back» something to close");
  await page.goBack(); await page.waitForTimeout(300);
  assert.deepEqual(await st(), { modal: false, view: "viewToday" });
  // closed by its button: the next «back» works as usual, no second press needed
  await page.evaluate(() => showView("viewMoney"));
  await page.evaluate(() => openTransferForm()); await page.waitForTimeout(150);
  await page.click("#closeModalBtn"); await page.waitForTimeout(300);
  assert.deepEqual(await st(), { modal: false, view: "viewMoney" });
  await page.goBack(); await page.waitForTimeout(300);
  assert.deepEqual(await st(), { modal: false, view: "viewToday" }, "one «back» after closing a window returns to the previous screen");
  // one window replaced by another (closeModal(); openX()): «back» closes the new one
  await page.evaluate(() => { openMoneyForm("profit"); closeModal(); openDebtHistory("all"); }); await page.waitForTimeout(300);
  assert.equal((await st()).modal, true, "the second window must stay open");
  await page.goBack(); await page.waitForTimeout(300);
  assert.deepEqual(await st(), { modal: false, view: "viewToday" });
  // a window that leads to another screen (search → goal editor): «back» returns to the screen it was opened from
  await page.evaluate(() => { showView("viewMoney"); openMoneyForm("expense"); closeModal(); showView("viewGoalEdit"); }); await page.waitForTimeout(300);
  await page.goBack(); await page.waitForTimeout(300);
  assert.deepEqual(await st(), { modal: false, view: "viewMoney" });
  // Esc on a PC
  await page.evaluate(() => openBudget()); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  assert.equal((await st()).modal, false);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Назад: экран возвращается на то же место прокрутки, а не наверх", async () => {
  const { ctx, page } = await device(makeCloud());
  const y = () => page.evaluate(() => Math.round(scrollY));
  await page.waitForTimeout(200); await page.evaluate(() => scrollTo(0, 1200)); await page.waitForTimeout(150);
  const at = await y(); assert.ok(at > 600, "the page must be long enough to scroll: " + at);
  // a sub-screen opens at the top; «back» (Android gesture / browser) returns to the same place
  await page.evaluate(() => showView("viewSettings")); await page.waitForTimeout(200);
  assert.equal(await y(), 0, "a sub-screen opens at the top");
  await page.goBack(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => currentView), "viewToday");
  assert.ok(Math.abs(await y() - at) <= 2, `back must return to ${at}, got ${await y()}`);
  // bottom tabs keep their own place too; tapping the active tab again scrolls up
  await page.evaluate(() => showView("viewMoney")); await page.waitForTimeout(200);
  await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(100);
  const money = await y();
  await page.evaluate(() => showView("viewToday")); await page.waitForTimeout(250);
  assert.ok(Math.abs(await y() - at) <= 2, "Today keeps its place");
  await page.evaluate(() => showView("viewMoney")); await page.waitForTimeout(250);
  assert.ok(Math.abs(await y() - money) <= 2, "Money keeps its place");
  await page.evaluate(() => showView("viewMoney")); await page.waitForTimeout(250);
  assert.equal(await y(), 0, "the same tab again scrolls to the top");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V71: пульс-шкала, отчёт дня, привычка-отказ, победы с благодарностью, напоминания о цели каждые 2 часа", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(seedGoal);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const r = await page.evaluate(() => {
    const k = keyDay(), now = new Date().toISOString();
    state.profits.push({ id: "v71p", amount: 1500, source: "Работа", sourceGroup: "Работа", at: now, dateKey: k });
    state.expenses.push({ id: "v71e", amount: 300, category: "Еда", at: now, dateKey: k }, { id: "v71d", amount: 1000, category: "Долг", debtPayment: "bank", at: now, dateKey: k });
    state.goal.finance.targetAmount = 40000; const td = new Date(); td.setMonth(td.getMonth() + 6); state.goal.finance.targetDate = keyDay(td);
    state.goal.milestones.forEach((m, i) => { m.done = i === 0; m.autoOff = true; if (m.done) m.doneAt = now; });
    state.day.steps = [{ id: "w", time: "08:00", end: "18:00", title: "Работа" }, { id: "f", time: "18:00", end: "23:00", title: "Дом, семья и отдых" }];
    state.settings.every2h = true; state.settings.notifications = true;
    saveState(); renderAll();
    const L = dayLedger(), slots = twoHourSlots();
    return { L, slots, gauge: document.getElementById("pgValue").dataset.v, ledger: document.getElementById("dayLedger").textContent,
      wins: document.getElementById("achievements").textContent };
  });
  // the day report counts the same numbers as everywhere: spending without the debt payment, the net with it
  assert.equal(r.L.inc, 1500); assert.equal(r.L.out, 300); assert.equal(r.L.debt, 1000); assert.equal(r.L.net, 200);
  assert.ok(r.ledger.includes("Куда ушло") && r.ledger.includes("Еда"), "the report shows where the money went");
  assert.match(String(r.gauge), /^\d+$/, "the pulse gauge has a value");
  // free time after work: every 2 hours a reminder about the goal (not a generic tip); during work — a short pause
  const free = r.slots.filter(s => s.min >= 18 * 60), work = r.slots.filter(s => s.min < 18 * 60);
  assert.deepEqual(free.map(s => s.time), ["20:00", "22:00"]);
  assert.ok(free.every(s => s.body.includes("🎯") && s.body.includes("до цели")), "free-time reminders talk about the goal: " + free.map(s => s.body).join(" | "));
  assert.ok(work.length && work.every(s => s.title.includes("пауза")), "work reminders are short pauses");
  // the closed stage is a win with a thank-you
  assert.ok(r.wins.includes("Этап 1 закрыт") && /Спасибо|Браво|Горжусь|справился|упорство/.test(r.wins), "a closed stage shows up in «Достигнуто» with thanks");
  // a «отказ» habit: made in the editor, ticked when held, survives a reload
  await page.evaluate(() => openHabitEditor());
  await page.fill("#hbTitle", "Без соцсетей до обеда"); await page.selectOption("#hbType", "avoid"); await page.click("#hbSave");
  await page.waitForTimeout(200);
  const h = await page.evaluate(() => state.habits.find(x => x.title === "Без соцсетей до обеда"));
  assert.equal(h.avoid, true);
  await page.click(`[data-habit-check="${h.id}"]`); await page.waitForTimeout(200);
  assert.ok(await page.evaluate(id => document.querySelector(`[data-habit-row="${id}"]`).classList.contains("is-done"), h.id), "the held habit burns");
  await page.reload(); await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true);
  assert.equal(await page.evaluate(() => state.habits.find(x => x.title === "Без соцсетей до обеда")?.avoid), true, "the kind survives a reload");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});


// ---------- V72 ----------
const V72_SEED = () => {
  const k = keyDay(), td = new Date(); td.setMonth(td.getMonth() + 6);
  state.goal.title = "Квартира"; state.goal.finance.targetAmount = 50000; state.goal.finance.targetDate = keyDay(td); state.goal.finance.manualSavedAmount = 5000;
  state.goal.milestones = [{ id: "m1", title: "Первый взнос", done: false, autoOff: true }, { id: "m2", title: "Ремонт", done: false, autoOff: true }];
  state.day.steps = [{ id: "w", time: "08:00", end: "12:00", title: "Работа", details: ["Отчёт клиенту", "Звонки поставщикам"], text: "" },
    { id: "f", time: "12:00", end: "18:00", title: "Дом и отдых", details: [], text: "" }, { id: "c", time: "18:00", end: "18:30", title: "Итог дня", details: [], text: "" }];
  state.settings.every2h = true; state.settings.notifications = true; state.settings.wakeTime = "07:00"; saveState(); renderAll(); };

await test("V72 D8: ритм дня — «главное» этапа связано с целью; напоминания начала и конца этапа из данных, каждый день разные", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T07:30:00+05:00") });
  await page.evaluate(V72_SEED);
  const texts = () => page.evaluate(() => { const r = state.day.steps.map((s, i) => stageReminderTexts(i)); return { r, slots: twoHourSlots().map(x => x.title + " | " + x.body) }; });
  const d1 = await texts();
  for (const [i, x] of d1.r.entries()) {
    for (const n of [x.start, x.end]) assert.ok((n.title + n.body).includes("Квартира"), `stage ${i}: the goal name is in the reminder: ${n.title} — ${n.body}`);
    assert.ok(x.start.body.includes(x.focus.main), "the start reminder names the action of the stage");
    assert.match(x.start.body, /До цели «Квартира»: 45 тыс\. сомони, \d+ д/, "the start reminder says what is left and the days");
    assert.match(x.end.body, /^Сделал главное\?/);
  }
  assert.ok(["Отчёт клиенту", "Звонки поставщикам"].includes(d1.r[0].focus.main), "work: the user's own words for the stage, picked by the day: " + d1.r[0].focus.main);
  assert.match(d1.r[1].focus.main, /Первый взнос/, "free time: the next goal stage");
  assert.match(d1.r[2].focus.main, /Закрыть день/);
  const all1 = [...d1.r.flatMap(x => [x.start.title + "|" + x.start.body, x.end.title + "|" + x.end.body]), ...d1.slots];
  assert.equal(new Set(all1).size, all1.length, "no reminder repeats another one: " + all1.join("\n"));
  // the next day the words are different (numbers and the rotating fact come from the data)
  await page.clock.setSystemTime(new Date("2026-10-17T07:30:00+05:00"));
  const d2 = await texts();
  d1.r.forEach((x, i) => assert.notEqual(x.start.body, d2.r[i].start.body, "stage " + i + " says the same thing two days in a row"));
  // the scheduler: start of a stage, then 10 minutes before its end — «Сделал главное?» with Да / Перенести
  await page.clock.setSystemTime(new Date("2026-10-17T08:01:00+05:00")); await page.evaluate(() => { state.notificationsLog = []; runScheduler(); });
  await page.clock.setSystemTime(new Date("2026-10-17T11:51:00+05:00")); await page.evaluate(() => runScheduler());
  const n = await page.evaluate(() => state.notificationsLog.map(x => x.title + " | " + x.body));
  assert.ok(n.some(x => /^Сейчас: .*Работа \| Главное: .+До цели «Квартира»/.test(x)), "start reminder: " + n.join(" || "));
  assert.ok(n.some(x => /Этап заканчивается: Работа \| Сделал главное\?.*Квартира/.test(x)), "end reminder: " + n.join(" || "));
  // the hero and the day strip are open at once, no tap needed
  const ui = await page.evaluate(() => { showView("viewToday"); renderToday(); const v = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && e.getBoundingClientRect().height > 10; }; return { focus: v("nowFocus"), strip: v("dayStrip"), text: document.getElementById("nowFocus").textContent, main: document.querySelector('#timeline .jl-rstep.current .jl-rstep-main')?.textContent || "" }; });
  assert.ok(ui.focus && ui.strip, "focus and the day strip are visible");
  assert.match(ui.text, /Главное сейчас · до цели 45 тыс. сомони/); assert.equal(ui.main, "", "74: «Главное сейчас» once — in the «Сейчас» window, not again in the rhythm");
  // «Да» from the reminder marks the main action done; «Перенести» moves it on as a goal task
  const act = await page.evaluate(() => { applyReminderAction("done", "stage:w"); applyReminderAction("snooze", "stage:f"); const t = state.tasks.find(x => x.goal && x.title.includes("Первый взнос"));
    return { done: !!dailyState().stageDone?.w, moved: dailyState().stageMoved?.f, task: t && { date: t.date, time: t.time, ms: t.ms }, report: dayLedger().gActs }; });
  assert.ok(act.done, "«Да» marks the stage"); assert.ok(act.moved && act.task && act.task.ms === "m1" && act.task.time === "12:00" && act.task.date === "2026-10-18", "«Перенести» → a goal task in the same stage tomorrow (no other stage left today): " + JSON.stringify(act));
  assert.ok(act.report.some(x => /Отчёт|Звонки/.test(x)), "the done stage goes to the day report: " + act.report);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D8: Android — у конца этапа кнопки «Да / Перенести», тексты будильников из данных", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T07:30:00+05:00"), init: () => { window.__calls = []; window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); return k === "bridgeVersion" ? 5 : undefined; } }); } });
  await page.evaluate(V72_SEED);
  const c = await page.evaluate(() => { __calls.length = 0; scheduleNative(); return __calls.filter(x => x[0] === "scheduleDaily").map(x => x.slice(1)); });
  const byId = Object.fromEntries(c.map(x => [x[0], x]));
  assert.ok(byId.w && /Сейчас: .*Работа/.test(byId.w[2]) && /Квартира/.test(byId.w[3]), "stage start alarm: " + JSON.stringify(byId.w));
  assert.ok(byId.stend_w && byId.stend_w[1] === "11:50" && /Сделал главное/.test(byId.stend_w[3]), "10 minutes before the end: " + JSON.stringify(byId.stend_w));
  const java = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/AlarmReceiver.java"), "utf8") + fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/NotificationUtil.java"), "utf8");
  assert.ok(java.includes('"stend_"') && java.includes('"Перенести"') && java.includes('"Да"'), "Android shows «Да / Перенести» on stage reminders");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D9: «Свободное время» — сначала главное по цели, время следующего напоминания из twoHourSlots, «Сделал» переживает перезагрузку", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T12:20:00+05:00") });
  await page.evaluate(V72_SEED);
  const r = await page.evaluate(() => { showView("viewToday"); renderFreePlan(); const box = document.getElementById("freePlan"), first = box.querySelector(".jl-free-item");
    const next = twoHourSlots().find(x => !x.work && x.min > nowMin()); return { first: first?.textContent || "", isGoal: first?.hasAttribute("data-free-goal"), next: box.querySelector("[data-next-2h]")?.textContent, want: next?.time, main: goalFocusLine().main, items: box.querySelectorAll(".jl-free-item").length }; });
  assert.ok(r.isGoal && r.first.includes(r.main) && r.first.includes("Сделал"), "the first line is the goal's main step: " + r.first);
  assert.ok(r.want && r.next === r.want, `next reminder ${r.next} = twoHourSlots ${r.want}`);
  assert.ok(r.items <= 3, "fewer generic ideas");
  await page.click("[data-free-goal]"); await page.waitForTimeout(200);
  await page.reload(); await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true);
  const after = await page.evaluate(() => ({ pressed: document.querySelector("[data-free-goal]")?.getAttribute("aria-pressed"), led: document.getElementById("dayLedger").textContent, acts: dayLedger().gActs }));
  assert.equal(after.pressed, "true", "the mark survives a reload");
  assert.ok(after.acts.some(x => x.includes("Первый взнос")) && after.led.includes("Первый взнос"), "and goes to the day report");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D10: задача «к цели» — значок 🎯, закрытие двигает этап, в уведомлении — цель", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T09:00:00+05:00") });
  await page.evaluate(V72_SEED);
  await page.evaluate(() => openTaskForm());
  await page.fill("#taskTitle", "Узнать цены на квартиры"); await page.click('[data-task-goal="1"]'); await page.click('[data-when="custom"]'); await page.fill("#taskTime", "09:05");
  await page.click("#saveTaskBtn");
  const t = await page.evaluate(() => state.tasks.find(x => x.title === "Узнать цены на квартиры"));
  assert.ok(t && t.goal === "main" && t.ms === "m1", "the task is linked to the current goal stage: " + JSON.stringify(t));
  const before = await page.evaluate(() => { showView("viewToday"); return { p: milestoneAuto(state.goal.milestones[0], 0, 2).p, tag: document.querySelector(`[data-task-row="${state.tasks.find(x => x.goal).id}"] .jl-goal-tag`)?.textContent }; });
  assert.match(before.tag || "", /🎯/, "a goal task wears 🎯");
  await page.clock.setSystemTime(new Date("2026-10-16T09:05:30+05:00"));
  const n = await page.evaluate(() => { state.notificationsLog = []; runScheduler(); return state.notificationsLog.map(x => x.title + " | " + x.body); });
  assert.ok(n.some(x => /^\S+ Пора: Узнать цены/.test(x) && !x.startsWith("⏰") && x.includes("Квартира")), "the reminder has the task emoji and the goal: " + n.join(" || "));
  await page.click(`[data-task-emo="${t.id}"]`); await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ p: milestoneAuto(state.goal.milestones[0], 0, 2).p, hint: milestoneAuto(state.goal.milestones[0], 0, 2).hint, done: state.goal.milestones[0].done }));
  assert.ok(after.p > before.p, `closing a goal task moves the stage: ${before.p} → ${after.p}`);
  assert.match(after.hint, /задачи 1\/1/, "the stage shows its tasks");
  // old tasks without the new fields keep working
  const old = await page.evaluate(() => normalize({ tasks: [{ id: "o", title: "Старая", date: keyDay() }] }).tasks[0]);
  assert.ok(!("goal" in old));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D11: этапы цели — дорожка: текущий крупно с % из milestoneAuto и «чтобы закрыть», закрытые с датой, будущие под замком", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => { const td = new Date(); td.setMonth(td.getMonth() + 6);
    state.goal.finance.targetAmount = 40000; state.goal.finance.targetDate = keyDay(td); state.goal.finance.manualSavedAmount = 8000;
    state.goal.milestones = [{ id: "a", title: "Подушка 1 месяц", done: true, doneAt: "2026-10-01T10:00:00Z" }, { id: "b", title: "Первый взнос", done: false, autoOff: false }, { id: "c", title: "Ремонт", done: false }];
    saveState(); showView("viewGoal"); renderGoal();
    const steps = [...document.querySelectorAll("#milestones .jl-step")], a = milestoneAuto(state.goal.milestones[1], 1, 3);
    return { cls: steps.map(x => x.className), pct: steps[1].querySelector("[data-ms-pct]")?.textContent, want: Math.round(a.p * 100) + "%", todo: steps[1].querySelector(".jl-ms-todo")?.textContent,
      done: steps[0].textContent, lock: steps[2].textContent, add: !!steps[1].querySelector("[data-ms-task]") }; });
  assert.deepEqual(r.cls, ["jl-step done", "jl-step current", "jl-step todo locked"]);
  assert.equal(r.pct, r.want, "the current stage shows the percent of milestoneAuto");
  assert.match(r.todo, /Чтобы закрыть: собери ещё/);
  assert.match(r.done, /Закрыт 1 октября/); assert.match(r.lock, /🔒 Откроется после этапа 2/);
  // a task straight from the stage
  await page.click("#milestones [data-ms-task]");
  assert.equal(await page.getAttribute('[data-task-goal][aria-pressed="true"]', "data-task-goal"), "1", "the stage is preselected in the task form");
  await page.evaluate(() => closeModal());
  // closing a stage by hand: date, celebration and a thank-you in «Достигнуто»
  await page.$eval('[data-ms="b"]', el => el.click()); await page.waitForTimeout(300);
  const w = await page.evaluate(() => ({ at: state.goal.milestones[1].doneAt, wins: document.getElementById("achievements").textContent }));
  assert.ok(w.at, "the date is kept"); assert.match(w.wins, /Этап 2 закрыт/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D12: ничего не скрыто и нет «мёртвых» иконок — нет руки-курсора без действия, кнопки-на-вид работают, текст не обрезан «…»", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(seedGoal);
  const bad = await page.evaluate(() => { const now = new Date().toISOString(), k = keyDay();
    state.goal.finance.targetAmount = 50000; state.goal.why = "Очень длинное объяснение, зачем нужна эта цель: своя квартира для семьи, спокойствие, стабильность и уверенность в завтрашнем дне";
    state.profits.push({ id: "p", amount: 8000, sourceGroup: "Зарплата", at: now, dateKey: k }); state.expenses.push({ id: "e", amount: 123456, category: "Очень длинная категория расходов для проверки", at: now, dateKey: k });
    state.goals.push({ id: "g2", title: "Машина — очень длинное название второй цели для проверки переноса", targetAmount: 9000, icon: "car", color: "green", createdAt: now, contributions: [] });
    state.habits = [{ id: "h", title: "Очень длинная привычка, которую надо видеть полностью", kind: "daily", target: 7 }]; state.budgets = [{ id: "b", name: "Поездки и отдых за городом с семьёй", planned: 1000, tops: [] }];
    state.tasks.push({ id: "t", title: "Позвонить в банк и уточнить график платежей по кредиту на следующий месяц", time: "23:00", date: k, goal: "main", ms: state.goal.milestones[0].id }); saveState(); renderAll();
    const out = [], LOOKS = ".btn,.jl-pill,.v-add,.iconbtn,.jl-chip,.v-link,.jl-icon-btn,.v-icon-btn";
    for (const v of ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewProfile", "viewNotifications", "viewDisplay"]) {
      showView(v);
      for (const tab of ["overview", "tx", "cal"]) {
        document.querySelector(`#${v} [data-money-tab="${tab}"]`)?.click();
        for (const el of document.querySelectorAll(`#${v} *`)) {
          if (!el.getClientRects().length) continue; const cs = getComputedStyle(el), name = v + "/" + tab + " " + el.tagName + "." + String(el.className.baseVal ?? el.className).slice(0, 30) + " «" + el.textContent.trim().slice(0, 24) + "»";
          const ctl = el.closest("button,a,label,input,select,textarea,[role=button],[tabindex]");
          if (cs.cursor === "pointer" && !ctl) out.push("pointer without action: " + name);
          if (el.matches(LOOKS) && !ctl) out.push("looks like a button but is not one: " + name);
          if ((cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") && !el.closest(".jl-quote") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.push("cut text: " + name);
        }
        if (v !== "viewMoney") break;
      }
    }
    return [...new Set(out)]; });
  assert.deepEqual(bad, [], bad.slice(0, 12).join("\n"));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D13: праздник уходит быстро, тосты не перекрывают «+» и нижнюю панель; повторный рендер ничего не перерисовывает", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(() => { showView("viewToday"); celebrate(); toast("Спасибо! Этап закрыт 🏁", "Закрыть основную часть долгов — ты сделал это"); });
  await page.waitForTimeout(450);
  const r = await page.evaluate(() => { const t = document.getElementById("toast").getBoundingClientRect(), hit = el => { if (!el || !el.getClientRects().length) return false; const b = el.getBoundingClientRect(); return !(t.right <= b.left || t.left >= b.right || t.bottom <= b.top || t.top >= b.bottom); };
    return { fab: hit(document.getElementById("quickAddBtn")), nav: [...document.querySelectorAll("nav")].some(n => getComputedStyle(n).position === "fixed" && hit(n)), shown: document.getElementById("toast").classList.contains("show") }; });
  assert.ok(r.shown); assert.equal(r.fab, false, "the toast covers the «+» button"); assert.equal(r.nav, false, "the toast covers the bottom bar");
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => document.querySelectorAll(".jl-confetti").length), 0, "the celebration is still on screen after 1.6 s");
  // the same data rendered again does not touch the DOM (no flicker)
  const changed = await page.evaluate(async () => { renderAll(); for (let q = 0; q < 40; q++) { let busy = false; const w = new MutationObserver(() => { busy = true; }); w.observe(document.querySelector("main"), { childList: true, subtree: true, characterData: true }); await new Promise(r => setTimeout(r, 400)); w.disconnect(); if (!busy) break; } /* wait until the number count-ups have finished (slow phones take longer) */ let n = 0; const mo = new MutationObserver(l => { n += l.filter(x => x.type === "childList" && !x.target.closest?.("#clock") && !(x.target.parentElement?.closest?.("#clock"))).length; /* the clock ticks by itself */ });
    mo.observe(document.querySelector("main"), { childList: true, subtree: true }); renderAll(); runScheduler(); await new Promise(r => setTimeout(r, 50)); mo.disconnect(); return n; });
  assert.equal(changed, 0, "a repeated render rebuilt " + changed + " blocks");
  // animations: only transform and opacity
  const css = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("</style>")[0], bad = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) { const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]).filter(x => !["transform", "opacity"].includes(x)); if (props.length) bad.push(m[1] + ": " + props.join(",")); }
  assert.deepEqual(bad, [], "animations must move only transform/opacity");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D14: иконки целей, банков и источников — градиентная плашка с анимацией; фильтры транзакций не обрезаны на 360 px", async () => {
  const { ctx, page } = await device(makeCloud(), { viewport: { width: 360, height: 760 } });
  const r = await page.evaluate(async () => { const now = new Date().toISOString();
    state.budgets = [{ id: "b1", name: "Еда", planned: 1500, tops: [], emoji: "🍲" }]; state.goals.push({ id: "g2", title: "Машина", targetAmount: 90000, icon: "car", color: "green", createdAt: now, contributions: [] }); saveState(); renderAll();
    const look = el => { const cs = getComputedStyle(el); return { grad: cs.backgroundImage.includes("gradient"), anim: cs.animationName }; }, out = {};
    showView("viewGoal"); out.goal = look(document.querySelector(".v-goal-ico"));
    showView("viewMoney"); document.querySelector('[data-money-tab="overview"]').click(); out.bank = look(document.querySelector(".jl-bank-top>.jl-emo"));
    document.querySelector('[data-money-tab="tx"]').click(); const W = document.documentElement.clientWidth;
    out.filters = [...document.querySelectorAll("#txFilters button")].filter(b => { const x = b.getBoundingClientRect(); return x.left < 0 || x.right > W; }).map(b => b.textContent);
    openMoneyForm("profit"); out.src = look(document.querySelector(".jl-src-tiles button i")); closeModal();
    openBudget(); out.sticker = look(document.querySelector(".jl-stickers button:not(.active) i")); closeModal();
    return out; });
  for (const k of ["goal", "bank", "src", "sticker"]) { assert.ok(r[k].grad, k + " icon has a gradient plaque"); assert.ok(/jlIconIn|jlStickerIn/.test(r[k].anim), k + " icon pops in: " + r[k].anim); }
  assert.deepEqual(r.filters, [], "filters cut at 360 px");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D15: облачные копии — снимок раз в сутки, старше 30 дней удаляются, восстановление возвращает те же данные", async () => {
  const cloud = makeCloud();
  cloud.history = [{ id: "old", user_id: UID, day: "2026-09-01", state: { notes: [] }, created_at: "2026-09-01T10:00:00Z" }, { id: "x", user_id: "someone-else", day: "2026-09-01", state: {}, created_at: "2026-09-01T10:00:00Z" }];
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-16T23:40:00+05:00"), session: cloud.session(5 * 86400) }); /* a login valid across the fixed clock */
  // the user's records (what the app works out by itself for the new day — motivation, empty report — is left aside)
  const strip = (src) => page.evaluate(src => { const x = snapshotOf(normalize(clone(src || state))); return JSON.stringify(["profits", "expenses", "notes", "tasks", "goal", "goals", "habits", "budgets", "achievements", "debts"].map(k => x[k])); }, src);
  await page.evaluate(async () => { const now = new Date().toISOString(), k = keyDay(); state.profits.push({ id: "cp", amount: 700, sourceGroup: "Фриланс", at: now, dateKey: k }); state.notes.push({ id: "cn", title: "Облако", body: "x", at: now, category: "work" }); state.goal.title = "Дом"; saveState(); });
  await page.evaluate(async () => { await _cloudSnapBusy; localStorage.removeItem(CLOUD_SNAP_KEY); }); /* the start-up copy was taken before these records: start the day over */
  cloud.history = cloud.history.filter(r => r.id === "old" || r.user_id !== UID);
  await sync(page); await page.evaluate(() => _cloudSnapBusy); await sync(page); await page.evaluate(() => _cloudSnapBusy);
  const mine = () => cloud.history.filter(r => r.user_id === UID);
  assert.deepEqual(mine().map(r => r.day), ["2026-10-16"], "one copy a day; the copy older than 30 days is gone: " + JSON.stringify(mine().map(r => r.day)));
  assert.ok(cloud.history.some(r => r.user_id === "someone-else"), "other users' rows are not touched");
  // the next day: another copy
  await page.clock.setSystemTime(new Date("2026-10-17T00:05:00+05:00")); /* past midnight; the login stays valid */
  await page.evaluate(() => { state.goal.title = "Машина"; state.notes = state.notes.filter(n => n.id !== "cn"); saveState(); });
  await sync(page); await page.evaluate(() => _cloudSnapBusy);
  assert.deepEqual(mine().map(r => r.day).sort(), ["2026-10-16", "2026-10-17"]);
  // restore the 16th from the cloud: list → preview → confirm
  await page.evaluate(() => { window.confirm = () => true; openBackups(); });
  await page.waitForSelector("[data-cloud-bk]");
  const id = mine().find(r => r.day === "2026-10-16").id;
  await page.click(`[data-cloud-bk="${id}"]`); await page.waitForFunction(id => document.querySelector(`[data-cloud-bk="${id}"]`)?.dataset.ready === "1", id);
  const preview = await page.textContent(`[data-cloud-row="${id}"] [data-cloud-sum]`);
  assert.match(preview, /операц.*цел.*замет/, "preview shows how many operations, goals, notes: " + preview);
  await page.click(`[data-cloud-bk="${id}"]`); await page.waitForTimeout(300);
  const snap = await strip(cloud.history.find(r => r.id === id).state);
  assert.ok(snap.includes("Облако") && snap.includes("Дом"), "the copy holds that day's data");
  assert.equal(await strip(), snap, "restored data equal the copy");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72 D16: AI видит отчёт дня, привычки-отказы, победы и этап цели; при долгом ответе — «Google перегружен, пробую другую модель…»", async () => {
  const cloud = makeCloud(); cloud.aiDelay = 8200;
  const { ctx, page } = await device(cloud);
  await page.evaluate(seedGoal);
  await page.evaluate(() => { const now = new Date().toISOString(), k = keyDay(); state.profits.push({ id: "ai1", amount: 1200, sourceGroup: "Фриланс", at: now, dateKey: k }); state.expenses.push({ id: "ai2", amount: 200, category: "Еда", at: now, dateKey: k });
    state.habits = [{ id: "hv", title: "Без соцсетей", kind: "daily", target: 7, avoid: true }]; state.habitLog = { hv: { [k]: 1 } };
    state.goal.milestones[0].done = true; state.goal.milestones[0].doneAt = now; state.goal.milestones[1].autoOff = true; saveState(); renderAll(); openGeminiAnalysis(); });
  await page.click("#aiRunBtn");
  await page.waitForSelector("[data-ai-slow]", { timeout: 9000 });
  assert.match(await page.textContent("[data-ai-slow]"), /Google перегружен, пробую другую модель/);
  await page.waitForSelector(".jl-ai-result", { timeout: 15000 });
  const f = cloud.aiBodies.at(-1).facts;
  assert.equal(f.dayReport.income, 1200); assert.equal(f.dayReport.spent, 200); assert.ok(Array.isArray(f.dayReport.where) && f.dayReport.where[0].category === "Еда");
  assert.deepEqual(f.avoidHabits.map(h => [h.title, h.heldToday]), [["Без соцсетей", true]]);
  assert.ok(f.wins.some(w => /Этап 1 закрыт/.test(w.title)), "wins go to the AI");
  assert.ok(f.goalStage && f.goalStage.n === 2 && typeof f.goalStage.toClose === "string", "the current goal stage goes to the AI");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("V72: цитата дня — хадис Пророка ﷺ с источником, каждый день новый (год без повтора), читается в обеих темах", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T09:00:00+05:00") });
  const seen = [];
  for (let d = 0; d < 40; d++) {
    await page.clock.setSystemTime(new Date(Date.parse("2026-10-16T09:00:00+05:00") + d * 864e5));
    seen.push(await page.evaluate(() => { state.settings.quoteSet = "hadith"; const m = motivation(); return m.author + "|" + m.text + "|" + m.source; }));
  }
  assert.ok(seen.every(x => x.startsWith("Пророк Мухаммад ﷺ|«") && x.split("|")[2].length > 3), "a hadith with its source every day");
  assert.equal(new Set(seen).size, 40, "40 days — 40 different hadiths");
  assert.ok(await page.evaluate(() => MOTIVATIONS.length >= 365 && new Set(MOTIVATIONS.map(m => m.text)).size === MOTIVATIONS.length), "a year without a repeat: 365+ different hadiths");
  const c = await page.evaluate(() => { showView("viewToday"); renderToday(); state.settings.theme = "light"; setTheme(); const q = document.querySelector(".jl-quote blockquote"); return getComputedStyle(q).color; });
  assert.notEqual(c, "rgb(58, 47, 18)", "the quote on the dark hero must be light in the light theme too");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// Every window, every button: each one does something visible and nothing throws.
const WINDOWS = [
  ["Быстрое добавление", "openQuickAdd()"], ["Расход", "openMoneyForm('expense')"], ["Доход", "openMoneyForm('profit')"], ["Изменить расход", "openMoneyEdit('expense','swE')"],
  ["Перевод", "openTransferForm()"], ["Тип операции", "openTxTypePicker()"], ["Задача", "openTaskForm()"], ["Привычка", "openHabitEditor()"], ["Новый банк", "openBudget()"], ["Банк", "openBudget('swB')"],
  ["Пополнить банк", "openBankTopup('swB')"], ["Долг", "openDebtEdit()"], ["История долга", "openDebtHistory('all')"], ["Главная цель", "openGoalEdit()"], ["Сумма цели", "openGoalFinanceEdit()"],
  ["В цель", "openGoalSaving()"], ["Календарь", "openCalendar()"], ["Настройки", "openSettings()"], ["Безопасность", "openSecurity()"], ["Корзина", "openTrash()"],
  ["AI-анализ", "openGeminiAnalysis()"], ["Полный разбор", "openLifeAnalysis()"], ["Поиск", "openSearch()"], ["Достижение", "openAchievement()"], ["Резервная копия", "openBackupDialog()"],
  ["Копии", "openBackups()"], ["Профиль", "openProfileEdit()"], ["Отчёты", "openReportHistory()"], ["День", "openDayProgress()"], ["Касса", "openMetricDetail('cash')"],
  // the calendar opens on «1 January → today»; start from another period so its quick buttons have something to change
  ["Настройка 1", "openOnboarding(1)"], ["Настройка 2", "openOnboarding(2)"], ["Настройка 3", "openOnboarding(3)"],
  ["Календарь, период", "openCalendar(); calendarRangeStart = '2026-03-01'; calendarRangeEnd = '2026-03-05'; renderCalendar(new Date().getFullYear(), new Date().getMonth(), keyDay())"],
];
await test("Все окна: каждая кнопка работает, ошибок нет", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(() => {
    const now = new Date().toISOString(), k = keyDay();
    state.expenses.push({ id: "swE", amount: 300, category: "Еда", at: now, dateKey: k }); state.profits.push({ id: "swP", amount: 900, sourceGroup: "Фриланс", at: now, dateKey: k });
    state.budgets = [{ id: "swB", name: "Поездки", planned: 1000, tops: [] }]; state.debts = { bank: 9000, firms: 1000, monthlyPayment: 500 }; ensureDebtHistory();
    state.tasks.push({ id: "swT", title: "Позвонить", time: "23:00", date: k }); state.habits = [{ id: "swH", title: "Спорт", kind: "daily", target: 7 }];
    state.goal.finance.targetAmount = 50000; saveState(); renderAll();
    window.__snap = JSON.stringify(state);
    window.confirm = () => false; window.prompt = () => null; window.alert = () => {}; window.open = () => null;
  });
  const dead = [], errs = [];
  for (const [name, open] of WINDOWS) {
    const ok = await page.evaluate(open => { try { closeModal(); state = normalize(JSON.parse(window.__snap)); renderAll(); showView("viewToday"); eval(open); return !!document.getElementById("modalBack").classList.contains("open"); } catch (e) { return "ERR " + e.message; } }, open);
    if (ok !== true) { errs.push(name + ": does not open " + ok); continue; }
    const n = await page.evaluate(() => [...document.querySelectorAll("#modal button, #modal [role=button]")].length);
    for (let i = 0; i < n; i++) {
      const before = await page.evaluate(([open, i]) => {
        closeModal(); state = normalize(JSON.parse(window.__snap)); saveState(); renderAll(); showView("viewToday"); eval(open);
        const b = [...document.querySelectorAll("#modal button, #modal [role=button]")][i];
        if (!b || b.offsetParent === null || b.disabled) return null;
        window.__dl = 0; document.querySelectorAll("a[download]").forEach(a => a.addEventListener("click", () => window.__dl++));
        const snap = { label: (b.getAttribute("aria-label") || b.textContent || b.id || b.className).trim().replace(/\s+/g, " ").slice(0, 40), html: document.getElementById("modal").innerHTML, open: document.getElementById("modalBack").classList.contains("open"), view: currentView, st: JSON.stringify(state), toast: document.getElementById("toast").textContent, cls: b.className, aria: b.getAttribute("aria-pressed") + b.getAttribute("aria-expanded") };
        window.__before = snap; b.click(); return snap.label;
      }, [open, i]);
      if (before === null) continue;
      await page.waitForTimeout(260);
      const changed = await page.evaluate(i => { const s = window.__before, b = [...document.querySelectorAll("#modal button, #modal [role=button]")][i];
        return document.getElementById("modal").innerHTML !== s.html || document.getElementById("modalBack").classList.contains("open") !== s.open || currentView !== s.view || JSON.stringify(state) !== s.st || document.getElementById("toast").textContent !== s.toast || window.__dl > 0 || (b && (b.className !== s.cls || (b.getAttribute("aria-pressed") + b.getAttribute("aria-expanded")) !== s.aria)) || document.activeElement?.closest?.("#modal input, #modal textarea, #modal select"); }, i);
      // not a bug: the period already is «1 January → today» (the same as tapping an already chosen chip)
      const already = (name === "Календарь" && /^(С 1 января|До сегодня)$/.test(before)) || (name === "Настройка 3" && before === "Работа 9–18"); // the template already chosen (it brings back its times after an edit)
      if (!changed && !already) dead.push(name + " → «" + before + "»");
    }
  }
  if (process.env.SWEEP_LOG) console.log("   dead buttons:\n   " + dead.join("\n   "));
  assert.deepEqual(errs, []);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(dead, [], "buttons that do nothing: " + dead.join("; "));
  await ctx.close();
});

await test("Все экраны: каждая кнопка работает, ошибок нет", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(() => {
    const now = new Date().toISOString(), k = keyDay();
    state.expenses.push({ id: "swE", amount: 300, category: "Еда", at: now, dateKey: k }); state.profits.push({ id: "swP", amount: 900, sourceGroup: "Фриланс", at: now, dateKey: k });
    state.budgets = [{ id: "swB", name: "Поездки", planned: 1000, tops: [] }]; state.debts = { bank: 9000, firms: 1000, monthlyPayment: 500 }; ensureDebtHistory();
    state.tasks.push({ id: "swT", title: "Позвонить", time: "23:00", date: k }); state.habits = [{ id: "swH", title: "Спорт", kind: "daily", target: 7 }];
    state.notes.push({ id: "swN", title: "Идея", body: "текст", at: now, category: "work" }); state.goal.finance.targetAmount = 50000; saveState(); renderAll();
    window.__snap = JSON.stringify(state);
    window.confirm = () => false; window.prompt = () => null; window.alert = () => {}; window.open = () => null;
  });
  const VIEWS = [["viewToday", ""], ["viewGoal", ""], ["viewMoney", "overview"], ["viewMoney", "tx"], ["viewMoney", "cal"], ["viewNotes", ""], ["viewSettings", ""], ["viewDisplay", ""], ["viewNotifications", ""], ["viewProfile", ""]];
  const dead = [];
  for (const [view, tab] of VIEWS) {
    const prep = `closeModal(); state = normalize(JSON.parse(window.__snap)); saveState(); renderAll(); showView("${view}"); ${tab ? `document.querySelector('[data-money-tab="${tab}"]').click();` : ""}`;
    const n = await page.evaluate(prep => { eval(prep); return document.querySelectorAll(`#${currentView} button, #${currentView} [role=button]`).length; }, prep);
    for (let i = 0; i < n; i++) {
      const label = await page.evaluate(([prep, i]) => {
        eval(prep);
        const b = [...document.querySelectorAll(`#${currentView} button, #${currentView} [role=button]`)][i];
        if (!b || b.offsetParent === null || b.disabled) return null;
        window.__before = { html: document.getElementById(currentView).innerHTML, open: document.getElementById("modalBack").classList.contains("open"), view: currentView, st: JSON.stringify(state), toast: document.getElementById("toast").textContent, cls: b.className, aria: b.getAttribute("aria-pressed") + b.getAttribute("aria-expanded") + b.getAttribute("aria-selected") };
        window.__btn = b; b.click(); return (b.getAttribute("aria-label") || b.textContent || b.id || b.className).trim().replace(/\s+/g, " ").slice(0, 40);
      }, [prep, i]);
      if (label === null) continue;
      await page.waitForTimeout(260);
      const changed = await page.evaluate(() => { const s = window.__before, b = window.__btn, v = document.getElementById(s.view);
        return v.innerHTML !== s.html || document.getElementById("modalBack").classList.contains("open") !== s.open || currentView !== s.view || JSON.stringify(state) !== s.st || document.getElementById("toast").textContent !== s.toast || (b.isConnected && (b.className !== s.cls || (b.getAttribute("aria-pressed") + b.getAttribute("aria-expanded") + b.getAttribute("aria-selected")) !== s.aria)) || !!document.activeElement?.matches?.("input, textarea, select"); });
      const active = await page.evaluate(() => /\bactive\b/.test(window.__before.cls) || /true/.test(window.__before.aria)); // already chosen tab or chip
      if (!changed && !active) dead.push(view + (tab ? "/" + tab : "") + " → «" + label + "»");
    }
  }
  if (process.env.SWEEP_LOG) console.log("   dead buttons:\n   " + dead.join("\n   "));
  assert.deepEqual(page.errors, []);
  assert.deepEqual(dead, [], "buttons that do nothing: " + dead.join("; "));
  await ctx.close();
});

await test("Цифры: одни и те же операции дают одинаковые суммы на всех экранах", async () => {
  // 3 October, 12:00 in Dushanbe: the week reaches back into September, the month has a midnight-crossing entry
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-03T12:00:00+05:00") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const r = await page.evaluate(async () => {
    const base = walletMetrics().cash;
    state.profits.push({ id: "P1", amount: 9000, sourceGroup: "Зарплата", at: "2026-10-03T05:00:00Z", dateKey: "2026-10-03" },
      { id: "P2", amount: 1000, sourceGroup: "Фриланс", at: "2026-09-20T05:00:00Z", dateKey: "2026-09-20" });
    state.expenses.push(
      { id: "E1", amount: 300, category: "Еда", at: "2026-10-03T05:00:00Z", dateKey: "2026-10-03" },
      { id: "E2", amount: 200, category: "Кафе", at: "2026-09-30T19:30:00Z", dateKey: "2026-10-01" },      // 00:30 on 1 October in Dushanbe
      { id: "E3", amount: 150, category: "Еда", at: "2026-10-02T07:00:00Z" },                               // old record without dateKey
      { id: "D1", amount: 4000, category: "Платёж по долгу", debtPayment: "bank", transfer: true, at: "2026-10-03T06:00:00Z", dateKey: "2026-10-03" },
      { id: "T1", amount: 500, category: "Перевод", transfer: true, at: "2026-10-02T06:00:00Z", dateKey: "2026-10-02" }, // old transfer stored as an expense
      { id: "E4", amount: 700, category: "Такси", at: "2026-09-29T06:00:00Z", dateKey: "2026-09-29" },
      { id: "E5", amount: 50, category: "Еда", at: "2025-12-31T18:30:00Z", dateKey: "2025-12-31" });       // last year
    state.goal.finance.targetAmount = 50000; state.goal.finance.targetDate = "2027-04-03";
    state.goal.finance.contributions.push({ id: "G1", amount: 1000, at: "2026-10-03T06:30:00Z" });
    state.debts = { bank: 90000, firms: 0, monthlyPayment: 4000 };
    state = normalize(state); saveState(); renderAll(); await new Promise(r => setTimeout(r, 50));
    const num = id => { const el = document.getElementById(id); const t = (el?.title || el?.textContent || "").replace(/[^\d,−-]/g, "").replace(",", "."); return Number(t.replace("−", "-")); };
    const out = {};
    out.todayMonth = num("tmExpense");
    showView("viewMoney"); mvPeriod = 30; renderMoneyOverview(); out.overview30 = num("mvExpense");
    mvPeriod = 7; renderMoneyOverview(); out.overview7 = num("mvExpense");
    mcYear = 2026; mcMonth = 9; mcSelected = "2026-10-03"; mcRange = null; renderMoneyCalendar(); out.calMonth = num("mcExpense"); out.calNet = num("mcNet");
    out.calDaySum = document.getElementById("mcDaySum").textContent.replace(/\s/g, " ");
    mcSetRange("2026-01-01", "2026-10-03"); out.calRange = document.getElementById("mcRangeBox").textContent.replace(/\s/g, " ");
    mcSetRange(null); mcYear = 2025; mcMonth = 11; renderMoneyCalendar(); out.calDec2025 = num("mcExpense");
    out.daySumOld = daySum(spendOnly(state.expenses), "2026-10-02"); out.dayOld = dayExpenses("2026-10-02"); out.rangeOld = calendarRangeMetrics("2026-01-01", "2026-10-03");
    out.week = weekStats(); out.donut = document.getElementById("expenseDonutCenter")?.textContent.replace(/\s/g, " ");
    out.facts = lifeFacts().spend; out.todayBalance = num("todayBalance"); out.cashDelta = walletMetrics().cash - base;
    showView("viewGoal"); renderGoal(); out.goalNeed = document.getElementById("goalRequiredMonth").textContent.replace(/\s/g, " ");
    openGoalEditor(mainGoal().id); await new Promise(r => setTimeout(r, 50)); renderGoalPreview(); out.goalFormNeed = (document.getElementById("geMonthly")?.textContent || "").replace(/\s/g, " ");
    return out;
  });
  const ex = JSON.stringify(r, null, 1);
  // «Расход» = spending only: no transfers, no debt payments
  assert.equal(r.todayMonth, 650, "Сегодня, месяц " + ex);       // 300 + 200 + 150
  assert.equal(r.calMonth, 650, "Календарь, месяц " + ex);
  assert.equal(r.overview30, 1350, "Обзор, 30 дней " + ex);       // + 700 in September
  assert.equal(r.overview7, 1350, "Обзор, 7 дней " + ex);
  assert.equal(r.week.out, 1350, "Неделя " + ex); assert.equal(r.week.debt, 4000);
  assert.equal(r.facts, 1350, "lifeFacts для AI, 30 дней " + ex);
  assert.equal(r.daySumOld, 150, "daySum, запись без dateKey " + ex);
  assert.match(r.calDaySum, /расход 300 .*долг 4 000/, "календарь, сумма дня " + ex);
  assert.equal(r.dayOld, 150, "старый календарь, день без dateKey " + ex);
  assert.equal(r.rangeOld.expense, 1350, "старый календарь, период " + ex); assert.equal(r.rangeOld.debt, 4000);
  assert.match(r.calRange, /Расход1 350/, "календарь, период " + ex);
  assert.equal(r.calDec2025, 50, "декабрь прошлого года " + ex);
  assert.match(r.donut, /650/, "круговая диаграмма месяца " + ex);
  // the remainder pays for everything
  assert.equal(r.calNet, 9000 - 650 - 4000, "Баланс месяца " + ex);
  assert.equal(r.todayBalance, 9000 - 300 - 4000, "Сегодня, остаток дня " + ex);
  assert.equal(r.cashDelta, 10000 - (300 + 200 + 150 + 4000 + 500 + 700 + 50) - 1000, "касса " + ex);
  // the goal form and the goal screen agree on «per month»
  assert.ok(r.goalFormNeed.includes(r.goalNeed), "Нужно в месяц: экран цели «" + r.goalNeed + "», форма «" + r.goalFormNeed + "»");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Цифры: формат сумм — округление, минус, пустые и битые значения, валюта", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => { const sp = x => x.replace(/\s/g, " "), cur = state.profile.currency;
    const rows = [0, 0.5, 12.345, 999.995, 1234.5, -1234.5, null, undefined, "", "abc", "12", NaN, Infinity, -Infinity, 1e7].map(v => [String(v), sp(fmtMoney(v)), sp(fmtNum(v)), sp(fmtShort(v))]);
    state.profile.currency = "$"; const usd = sp(fmtMoney(5)); state.profile.currency = cur; return { rows, usd }; });
  const m = Object.fromEntries(r.rows.map(x => [x[0], x.slice(1)]));
  assert.deepEqual(m["1234.5"], ["1 235 сомони", "1 235", "1 234,5"]);
  assert.deepEqual(m["-1234.5"].slice(0, 2), ["-1 235 сомони", "-1 235"], "negative amounts round the same way everywhere");
  assert.deepEqual(m["12.345"], ["12,35 сомони", "12", "12,35"]);
  for (const bad of ["null", "undefined", "", "abc", "NaN", "Infinity", "-Infinity"]) assert.deepEqual(m[bad], ["0 сомони", "0", "0"], "bad value " + bad);
  assert.equal(r.usd, "5 $");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Данные: битые и старые данные — приложение не падает и ничего не теряет", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const cases = {
      nullState: null, string: "x", array: [],
      nulls: { profits: null, expenses: null, tasks: null, notes: null, habits: null, budgets: null, goals: null, reports: null, debts: null, goal: null, settings: null, profile: null, ai: null, day: null, wallet: null, habitLog: null, achievements: null, debtHistory: null },
      strings: { income: "9000", debts: { bank: "90000", firms: "abc", monthlyPayment: "4500" }, profits: [{ id: "a", amount: "100", at: "2026-10-01T00:00:00Z" }], expenses: [{ id: "b", amount: "x", at: "nonsense" }, { id: "c", amount: 20, at: "nonsense", dateKey: "2026-10-01" }] },
      badItems: { expenses: [null, 5, "x", { id: "ok1", amount: 10, at: "2026-10-01T00:00:00Z" }], profits: [null, { id: "ok2", amount: 7, at: "2026-10-01T00:00:00Z" }], tasks: [null, { id: "t", title: "Задача", date: "2026-10-01" }], notes: [null, 7, { id: "n", title: "Заметка", body: null }],
        habits: [null, { title: null }], budgets: [null, { id: "bb", name: "Еда", tops: "x" }], goals: [null], reports: { "2026-10-01": null, "x": 5 }, habitLog: { h: null }, achievements: [null, { id: "a1", text: "Есть" }], debtHistory: [null, { day: "2026-10-01", total: 5 }] },
      goalBroken: { goal: { title: "Цель", milestones: [null, "x", { id: "m", title: "Этап" }], finance: { contributions: [null, { id: "c1", amount: "x", at: "2026-10-01T00:00:00Z" }, { id: "c2", amount: 300, at: "2026-10-01T00:00:00Z" }], targetAmount: "abc" } } },
      unknown: { foo: 1, profits: [{ id: "u", amount: 50, at: "2026-10-01T00:00:00Z", extra: "keep" }] },
      schema58: { version: 58, profits: [{ id: "o1", amount: 100, source: "Зарплата", at: "2026-09-01T00:00:00Z" }], expenses: [{ amount: 40, category: "Еда", at: "2026-09-02T00:00:00Z" }] },
    };
    const out = {};
    for (const [k, v] of Object.entries(cases)) {
      try {
        const n = normalize(v == null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v)));
        state = n; renderAll();
        for (const id of ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewProfile"]) showView(id);
        for (const tab of ["tx", "cal"]) { showView("viewMoney"); document.querySelector(`[data-money-tab="${tab}"]`).click(); }
        openLifeAnalysis(); closeModal(); openCalendar(); closeModal(); openDebtHistory("all"); closeModal(); lifeFacts();
        out[k] = { ok: true, n: JSON.parse(JSON.stringify(n)) };
      } catch (e) { out[k] = { ok: false, err: e.message + " " + (e.stack || "").split("\n")[1] }; }
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert.ok(v.ok, k + ": " + v.err);
  const ids = (n, list) => (n[list] || []).map(x => x.id);
  assert.equal(r.strings.n.income, 9000); assert.equal(r.strings.n.profits[0].amount, 100);
  assert.deepEqual(ids(r.strings.n, "expenses"), ["b", "c"], "records with a broken date are kept");
  assert.ok(ids(r.badItems.n, "expenses").includes("ok1") && ids(r.badItems.n, "profits").includes("ok2") && ids(r.badItems.n, "tasks").includes("t") && ids(r.badItems.n, "notes").includes("n") && ids(r.badItems.n, "achievements").includes("a1"), "valid records next to broken ones are kept");
  assert.ok(r.badItems.n.expenses.every(x => x && typeof x === "object"), "no null inside lists");
  assert.deepEqual(r.goalBroken.n.goal.finance.contributions.map(x => x.id), ["c1", "c2"]);
  assert.ok(r.goalBroken.n.goal.milestones.some(m => m.title === "Этап"));
  assert.equal(r.unknown.n.foo, 1); assert.equal(r.unknown.n.profits[0].extra, "keep");
  assert.equal(r.schema58.n.profits[0].amount, 100); assert.equal(r.schema58.n.expenses[0].amount, 40);
  // a record without id gets the same id on every device (so two devices never duplicate it)
  const again = await page.evaluate(() => normalize({ expenses: [{ amount: 40, category: "Еда", at: "2026-09-02T00:00:00Z" }] }).expenses[0].id);
  assert.ok(r.schema58.n.expenses[0].id && r.schema58.n.expenses[0].id === again, "stable id for old records: " + r.schema58.n.expenses[0].id + " vs " + again);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Синхронизация: старые записи без id + офлайн-правки на двух устройствах — ничего не теряется и не двоится", async () => {
  const cloud = makeCloud();
  const legacy = { version: 58, expenses: [{ amount: 40, category: "Еда", at: "2026-09-02T05:00:00Z" }, { amount: 60, category: "Такси", at: "2026-09-03T05:00:00Z" }], notes: [{ title: "Старая", body: "x", at: "2026-09-01T05:00:00Z" }] };
  cloud.row = { user_id: UID, state: legacy, schema_version: 58, updated_at: cloud.nextStamp() };
  const A = await device(cloud), B = await device(cloud);
  await sync(A.page); await sync(B.page);
  cloud.down = true;
  await A.page.evaluate(() => { state.expenses.push({ id: "fromA", amount: 11, category: "Еда", at: new Date().toISOString() }); state.notes[0].body = "правка A"; saveState(); });
  await B.page.evaluate(() => { state.expenses.push({ id: "fromB", amount: 22, category: "Еда", at: new Date().toISOString() }); saveState(); });
  await A.page.evaluate(() => cloudAutoSync().catch(() => {})); await B.page.evaluate(() => cloudAutoSync().catch(() => {}));
  cloud.down = false;
  await sync(A.page); await sync(B.page); await sync(A.page);
  const cl = cloud.row.state, a = await A.page.evaluate(() => state), b = await B.page.evaluate(() => state);
  for (const [who, st] of [["cloud", cl], ["A", a], ["B", b]]) {
    const am = st.expenses.map(x => x.amount).sort((x, y) => x - y);
    assert.deepEqual(am, [11, 22, 40, 60], who + " expenses: " + JSON.stringify(st.expenses.map(x => [x.id, x.amount])));
    assert.equal(st.notes.length, 1, who + " notes duplicated: " + st.notes.length); assert.equal(st.notes[0].body, "правка A", who);
  }
  assert.deepEqual(A.page.errors, []); assert.deepEqual(B.page.errors, []);
  await A.ctx.close(); await B.ctx.close();
});

await test("Резервная копия: создать → изменить → восстановить → данные те же, и облако их получает", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await page.evaluate(() => { window.__strip = s => { const x = normalize(JSON.parse(JSON.stringify(s))); for (const k of [...SYNC_META_KEYS, "runtimeErrors", "notificationsLog", "lastReadAt", "drafts", "_sent", "dailyMotivations", "dayMode", "daily", "_limitAlerts"]) delete x[k]; return JSON.stringify(x); }; }); // dayMode, daily, _limitAlerts are worked out by the app itself
  const snap = await page.evaluate(async () => {
    const now = new Date().toISOString(), k = keyDay();
    state.profits.push({ id: "bp", amount: 900, sourceGroup: "Фриланс", at: now, dateKey: k }); state.expenses.push({ id: "be", amount: 70, category: "Еда", at: now, dateKey: k });
    state.notes.push({ id: "bn", title: "Мысль", body: "x", at: now, category: "work" }); state.goal.title = "Квартира"; state.budgets = [{ id: "bb", name: "Еда", planned: 500, tops: [] }];
    saveState(); await cloudAutoSync();
    openBackupDialog(); document.getElementById("bkCreate").click();
    return __strip(state);
  });
  await page.evaluate(async () => {
    state.expenses = state.expenses.filter(x => x.id !== "be"); state.notes.push({ id: "late", title: "после", body: "", at: new Date().toISOString(), category: "work" });
    state.goal.title = "Машина"; state.budgets[0].planned = 900; saveState(); await cloudAutoSync();
    window.confirm = () => true; openBackupDialog(); document.getElementById("bkRestore").click();
  });
  const restored = await page.evaluate(() => __strip(state));
  assert.equal(restored, snap, "local data after restore differ from the backup");
  await sync(page); await sync(page);
  const after = await page.evaluate(() => ({ title: state.goal.title, be: state.expenses.some(x => x.id === "be"), planned: state.budgets[0]?.planned }));
  const cl = cloud.row.state;
  assert.deepEqual(after, { title: "Квартира", be: true, planned: 500 }, "the sync undid the restore on this device");
  assert.deepEqual({ title: cl.goal.title, be: cl.expenses.some(x => x.id === "be"), planned: cl.budgets[0]?.planned }, { title: "Квартира", be: true, planned: 500 }, "the cloud did not get the restored data");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Безопасность: вредный текст, введённый через все формы, нигде не выполняется", async () => {
  const { ctx, page } = await device(makeCloud());
  const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">"><script>window.__xss=7</script><svg onload="window.__xss=9">';
  await page.evaluate(() => { window.confirm = () => true; window.prompt = () => null; window.alert = () => {}; const now = new Date().toISOString(), k = keyDay();
    state.expenses.push({ id: "swE", amount: 300, category: "Еда", at: now, dateKey: k }); state.budgets = [{ id: "swB", name: "Поездки", planned: 1000, tops: [] }];
    state.tasks.push({ id: "swT", title: "Позвонить", time: "23:00", date: k }); state.habits = [{ id: "swH", title: "Спорт", kind: "daily", target: 7 }]; saveState(); renderAll(); });
  // every window: type the payload into every text field, then press its main button
  for (const [name, open] of WINDOWS) {
    await page.evaluate(([open, X]) => { closeModal(); showView("viewToday"); eval(open);
      document.querySelectorAll("#modal input:not([type]), #modal input[type=text], #modal input[type=search], #modal textarea").forEach(el => { if (el.offsetParent === null) return; el.value = X; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
      document.querySelectorAll("#modal input[type=number]").forEach(el => { if (el.offsetParent !== null && !el.value) { el.value = "5"; el.dispatchEvent(new Event("input", { bubbles: true })); } });
      const main = [...document.querySelectorAll("#modal .btn.primary")].find(b => b.offsetParent !== null && !/Удалить|Восстановить|Запустить|AI/i.test(b.textContent)); main?.click(); }, [open, X]);
    await page.waitForTimeout(150);
  }
  // the notes editor, the goal form and the report of the day are screens, not windows
  await page.evaluate(X => { closeModal(); openNoteEditor(""); const t = document.getElementById("noteTitle"), b = document.getElementById("noteBody"); if (t) { t.value = X; t.dispatchEvent(new Event("input", { bubbles: true })); } if (b) { b.value = X + "\n**" + X + "**"; b.dispatchEvent(new Event("input", { bubbles: true })); }
    showView("viewToday"); for (const id of ["rDone", "rBlock", "rTomorrow"]) { const el = document.getElementById(id); if (el) { el.value = X; el.dispatchEvent(new Event("input", { bubbles: true })); } }
    openGoalEditor(""); const g = document.getElementById("geName"); if (g) { g.value = X; g.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("geSave")?.click(); } }, X);
  await page.waitForTimeout(300);
  const stored = await page.evaluate(X => JSON.stringify(state).split(JSON.stringify(X).slice(1, -1)).length - 1, X);
  assert.ok(stored >= 8, "the payload should have reached many fields, got " + stored);
  // show everything: every screen, every window, the search
  await page.evaluate(async X => { saveState(); renderAll();
    for (const v of ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewDisplay", "viewProfile", "viewNotifications"]) { showView(v); for (const tab of ["overview", "tx", "cal"]) document.querySelector(`#${v} [data-money-tab="${tab}"]`)?.click(); }
    openSearch(); const q = document.querySelector("#modal input"); if (q) { q.value = "img"; q.dispatchEvent(new Event("input", { bubbles: true })); } await new Promise(r => setTimeout(r, 200)); }, X);
  for (const [, open] of WINDOWS) await page.evaluate(open => { try { closeModal(); eval(open); } catch (e) {} }, open);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ xss: window.__xss, injected: document.querySelectorAll("img[src='x'], [onerror], [onload], body script:not([src])").length - document.querySelectorAll("script[data-app]").length }));
  assert.equal(r.xss, undefined, "script ran from user text: " + r.xss);
  assert.ok(r.injected <= 1, "user text became HTML elements: " + r.injected); // the app's own inline <script> is the only one
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Вид: axe 0 нарушений на всех экранах и в окнах (тёмная и светлая тема)", async () => {
  const { ctx, page } = await device(makeCloud());
  const AXE = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "#toast{display:none!important}" });
  await page.evaluate(() => { const now = new Date().toISOString(), k = keyDay(); state.profile.name = "Джамал"; state.debts = { bank: 90000, firms: 10000, monthlyPayment: 4500 };
    state.profits.push({ id: "p1", amount: 8000, sourceGroup: "Зарплата", at: now, dateKey: k }); state.expenses.push({ id: "e1", amount: 300, category: "Еда", at: now, dateKey: k }, { id: "d1", amount: 4000, category: "Платёж по долгу", debtPayment: "bank", transfer: true, at: now, dateKey: k });
    state.tasks.push({ id: "t1", title: "Позвонить", time: "23:00", date: k }); state.notes.push({ id: "n1", title: "Идея", body: "текст", at: now, category: "work" });
    state.habits = [{ id: "h1", title: "Спорт", kind: "weekly", target: 3 }]; state.budgets = [{ id: "b1", name: "Поездки", planned: 1000, tops: [] }]; state.goal.finance.targetAmount = 50000; ensureDebtHistory(); saveState(); renderAll(); });
  await page.addScriptTag({ content: AXE });
  const places = [...["viewToday", "viewGoal", "viewGoalEdit", "viewMoney", "viewNotes", "viewNoteEdit", "viewSettings", "viewDisplay", "viewNotifications", "viewProfile"].map(v => [v, `closeModal(); showView("${v}")`]),
    ...["tx", "cal"].map(t => ["viewMoney/" + t, `closeModal(); showView("viewMoney"); document.querySelector('[data-money-tab="${t}"]').click()`]),
    ...WINDOWS.map(([n, o]) => [n, `closeModal(); showView("viewToday"); ${o}`])];
  const bad = [];
  for (const theme of ["dark", "light"]) {
    await page.evaluate(t => { state.settings.theme = t; setTheme(); }, theme);
    for (const [name, js] of places) {
      await page.evaluate(js => { eval(js); window.scrollTo(0, 0); }, js); await page.waitForTimeout(80);
      const v = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] }).then(r => r.violations.map(x => x.id + ": " + x.nodes.slice(0, 3).map(n => n.target.join(" ") + (n.any[0]?.data?.contrastRatio ? " " + n.any[0].data.contrastRatio : "")).join(", "))));
      for (const x of v) bad.push(`${theme} ${name} — ${x}`);
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 12).join("\n"));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("Вид: 6 ширин × 2 темы — нет горизонтальной прокрутки и вылезания; «уменьшить движение» выключает анимации", async () => {
  const bad = [];
  for (const width of [360, 390, 412, 768, 1024, 1440]) {
    const { ctx, page } = await device(makeCloud(), { viewport: { width, height: 844 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { const now = new Date().toISOString(), k = keyDay(); state.profile.name = "Джамал Абдуджамолов"; state.debts = { bank: 90000, firms: 10000, monthlyPayment: 4500 };
      state.expenses.push({ id: "e1", amount: 123456, category: "Очень длинная категория расходов", at: now, dateKey: k }); state.tasks.push({ id: "t1", title: "Позвонить в банк и уточнить график платежей по кредиту на следующий месяц", time: "23:00", date: k });
      state.notes.push({ id: "n1", title: "Очень длинный заголовок заметки, который не должен вылезать за край экрана", body: "текст", at: now, category: "work" }); state.budgets = [{ id: "b1", name: "Поездки и отдых за городом с семьёй", planned: 1000, tops: [] }]; ensureDebtHistory(); saveState(); renderAll(); });
    for (const theme of ["dark", "light"]) {
      await page.evaluate(t => { state.settings.theme = t; setTheme(); }, theme);
      for (const [name, js] of [...["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings", "viewProfile"].map(v => [v, `closeModal(); showView("${v}")`]), ...WINDOWS.slice(0, 12).map(([n, o]) => [n, `closeModal(); ${o}`])]) {
        await page.evaluate(js => eval(js), js); await page.waitForTimeout(60);
        const r = await page.evaluate(() => { const W = document.documentElement.clientWidth, out = []; if (document.documentElement.scrollWidth > W + 1) out.push("scrolls sideways " + document.documentElement.scrollWidth);
          const root = document.getElementById("modalBack").classList.contains("open") ? document.getElementById("modal") : document.querySelector(".view.active");
          for (const el of root.querySelectorAll("*")) { const rc = el.getBoundingClientRect(); if (!rc.width || !el.getClientRects().length) continue; let p = el.parentElement, clipped = false; while (p && p !== document.body) { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) { clipped = true; break; } p = p.parentElement; }
            if (!clipped && (rc.right > W + 1 || rc.left < -1)) { out.push("sticks out: " + (el.id || String(el.className.baseVal ?? el.className).slice(0, 30))); break; } }
          for (const el of document.querySelectorAll("body *")) { if (!el.getClientRects().length) continue; const cs = getComputedStyle(el); if (cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.02) { out.push("animates with reduced motion: " + (el.id || el.className)); break; } }
          return out; });
        for (const x of r) bad.push(`${width} ${theme} ${name}: ${x}`);
      }
    }
    assert.deepEqual(page.errors, [], width + "");
    await ctx.close();
  }
  assert.deepEqual(bad, [], bad.slice(0, 12).join("\n"));
});

await test("Окна: закрыл окно, пока идёт запрос (AI, облако) — ошибок нет", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  // slow answers, so every request is still running when the window closes
  await ctx.route(/supabase\.co\/functions/, async r => { await new Promise(res => setTimeout(res, 300)); return cloud.handle(r); });
  await page.evaluate(() => { window.confirm = () => true; window.prompt = () => null; window.alert = () => {}; window.open = () => null; window.__snap = JSON.stringify(state); });
  for (const [, open] of WINDOWS) {
    const n = await page.evaluate(open => { closeModal(); eval(open); return document.querySelectorAll("#modal button").length; }, open);
    for (let i = 0; i < n; i++) {
      await page.evaluate(([open, i]) => { closeModal(); state = normalize(JSON.parse(window.__snap)); eval(open); const b = [...document.querySelectorAll("#modal button")][i];
        if (b && b.offsetParent !== null && !/Удалить|Восстановить|Выйти|Сбросить|Очистить/i.test(b.textContent)) { b.click(); closeModal(); } }, [open, i]);
    }
  }
  await page.waitForTimeout(1200);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});


// ================= 73: an app for everybody =================
// A state of the same shape as the owner's cloud row (saved by 72: no quoteSet / debt names / onboarded), with made-up numbers.
const OWNER_LIKE = () => {
  const at = "2026-10-10T07:00:00.000Z";
  return { version: 58, profile: { name: "Тест", currency: "сомони", createdAt: "2026-01-05T07:00:00.000Z" },
    settings: { theme: "dark", preMinutes: 10, notifications: true, wakeTime: "06:30", every2h: true, fontScale: 1.1, font: "manrope", lang: "ru", notifyTasks: true, notifyFinance: true, notifyGoals: true, sound: true },
    income: 6100, debts: { bank: 73000, firms: 41000, monthlyPayment: 3900 }, debtBaseline: 130000,
    goal: { title: "Свой дом у моря", why: "Спокойная жизнь без аренды", next: "Отложить первый взнос", aiPlan: null, aiPlanAt: "", aiPlanGoalKey: "",
      finance: { targetAmount: 90000, savedAmount: 0, manualSavedAmount: 0, targetDate: "2028-06-01", startedAt: "2026-01-05T07:00:00.000Z", completedAt: "", contributions: [{ id: "gc1", amount: 2500, at, note: "" }] },
      milestones: [{ id: "m1", title: "Отложить первый взнос", done: true, doneAt: at }, { id: "m2", title: "Погасить кредит за технику", done: false }, { id: "m3", title: "Выбрать участок", done: false }, { id: "m4", title: "Начать стройку", done: false }] },
    day: { steps: [{ id: "s1", title: "Смена в цеху", text: "Свой рабочий блок", time: "07:40", end: "16:20", details: ["Принять смену", "Сдать отчёт"] },
      { id: "s2", title: "Спортзал и ужин", text: "После смены", time: "16:20", end: "21:10", details: ["Тренировка"] },
      { id: "s3", title: "Итог дня", text: "Закрыть день", time: "21:10", end: "21:40", details: ["Записать факт дня"] }] },
    profits: [{ id: "p1", amount: 3100, sourceGroup: "Спортивная аналитика", at, dateKey: "2026-10-10" }, { id: "p2", amount: 6100, sourceGroup: "Зарплата", at, dateKey: "2026-10-10" }],
    expenses: [{ id: "e1", amount: 420, category: "Еда", at, dateKey: "2026-10-10" }, { id: "e2", amount: 3900, category: "Платёж по долгу", debtPayment: "bank", transfer: true, at, dateKey: "2026-10-10" }],
    goals: [{ id: "goal-main", title: "Свой дом у моря", description: "Спокойная жизнь без аренды", icon: "home2", color: "green", targetAmount: 90000, targetDate: "2028-06-01", manualSaved: 0, contributions: [], createdAt: "2026-01-05T07:00:00.000Z", completedAt: "", main: true }],
    tasks: [{ id: "t1", title: "Позвонить мастеру", time: "18:30", date: "2026-10-10", done: true, doneAt: at, createdAt: at }],
    reports: { "2026-10-09": { done: "сделал главное", block: "", future: "", tomorrow: "шаг", savedAt: at, steps: { s1: true } } },
    habits: [], habitLog: {}, budgets: [], notes: [], notesTrash: [], achievements: [], notificationsLog: [], dailyMotivations: {}, debtHistory: [{ day: "2026-10-10", total: 114000, at }], _lastSavedAt: at };
};
const ownerView = () => ({ income: state.income, debts: [state.debts.bank, state.debts.firms, state.debts.monthlyPayment], goal: [state.goal.title, state.goal.why, state.goal.next, state.goal.finance.targetAmount, state.goal.finance.targetDate],
  ms: state.goal.milestones.map(m => m.title + (m.done ? "✓" : "")), steps: state.day.steps.map(x => [x.title, x.time, x.end, x.details.join("|")].join(" ")),
  money: [state.profits.length, state.expenses.length, state.tasks.length], labels: [debtLabel("bank"), debtLabel("firms")], quotes: quoteSet(), onboarded: state.settings.onboarded });
const OWNER_EXPECT = { income: 6100, debts: [73000, 41000, 3900], goal: ["Свой дом у моря", "Спокойная жизнь без аренды", "Отложить первый взнос", 90000, "2028-06-01"],
  ms: ["Отложить первый взнос✓", "Погасить кредит за технику", "Выбрать участок", "Начать стройку"],
  steps: ["Смена в цеху 07:40 16:20 Принять смену|Сдать отчёт", "Спортзал и ужин 16:20 21:10 Тренировка", "Итог дня 21:10 21:40 Записать факт дня"],
  money: [2, 2, 1], labels: ["Банк", "Фирмы"], quotes: "hadith", onboarded: true };

await test("73 «данные владельца»: сохранённые 72 доход, долги, цель с 4 этапами, распорядок и записи — на месте после загрузки, синхронизации и перезагрузки", async () => {
  const cloud = makeCloud();
  // the owner's phone: the state saved by 72 is on the device
  const { ctx, page } = await device(cloud, { onboarding: true, init: `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("LIFE_CONTROL_V52", ${JSON.stringify(JSON.stringify(OWNER_LIKE()))}); }` });
  await sync(page); await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(ownerView), OWNER_EXPECT, "after load and sync");
  assert.equal(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open")), false, "no first-start setup for an account with data");
  const ui = await page.evaluate(() => { showView("viewMoney"); const cells = [...document.querySelectorAll(".jl-debt-cell .label")].map(x => x.textContent.trim()); showView("viewGoal"); return { cells, goal: document.getElementById("goalTitle").textContent, quote: document.getElementById("motivationSource").textContent }; });
  assert.ok(ui.cells[0] === "Банк" && ui.cells[1] === "Фирмы", "debt names stay «Банк / Фирмы»: " + ui.cells);
  assert.equal(ui.goal, "Свой дом у моря"); assert.match(ui.quote, /Пророк Мухаммад ﷺ/);
  // the cloud row holds the same values — nothing replaced by the defaults
  const c = cloud.row.state;
  assert.deepEqual([c.income, c.debts.bank, c.debts.firms, c.debts.monthlyPayment, c.goal.title, c.goal.milestones.length, c.day.steps[0].time, c.profits.length], [6100, 73000, 41000, 3900, "Свой дом у моря", 4, "07:40", 2]);
  assert.deepEqual([c.settings.quoteSet, c.debts.labels, c.settings.onboarded], ["hadith", { bank: "Банк", firms: "Фирмы" }, true]);
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true); await sync(page);
  assert.deepEqual(await page.evaluate(ownerView), OWNER_EXPECT, "after a reload");
  // a second device of the owner: everything arrives from the cloud, the setup never shows
  const B = await device(cloud, { onboarding: true });
  await sync(B.page); await B.page.waitForTimeout(400);
  assert.deepEqual(await B.page.evaluate(ownerView), OWNER_EXPECT, "on a second device");
  assert.equal(await B.page.evaluate(() => document.getElementById("modalBack").classList.contains("open")), false, "no setup on the second device");
  assert.deepEqual(page.errors, []); assert.deepEqual(B.page.errors, []);
  await ctx.close(); await B.ctx.close();
});

await test("73: строка владельца из облака на новом устройстве — первый контакт сохраняет все значения", async () => {
  const cloud = makeCloud();
  cloud.row = { user_id: UID, state: OWNER_LIKE(), schema_version: 58, updated_at: cloud.nextStamp() };
  const { ctx, page } = await device(cloud, { onboarding: true });
  await sync(page); await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(ownerView), OWNER_EXPECT);
  assert.equal(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open")), false);
  assert.equal(cloud.row.state.income, 6100); assert.equal(cloud.row.state.goal.milestones.length, 4);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("73: новый пустой аккаунт — чистый лист, хадис дня, первая настройка из 3 шагов уходит в облако", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { onboarding: true });
  await page.waitForSelector("#obNext", { timeout: 8000 });
  const clean = await page.evaluate(() => ({ income: state.income, debts: [state.debts.bank, state.debts.firms, state.debts.monthlyPayment], goal: state.goal.title, ms: state.goal.milestones.length, labels: [debtLabel("bank"), debtLabel("firms")], q: quoteSet(), src: profitSources(), title: document.title, brand: document.querySelector(".brand-name").textContent.trim() }));
  assert.deepEqual(clean, { income: 0, debts: [0, 0, 0], goal: "", ms: 0, labels: ["Долг 1", "Долг 2"], q: "hadith", src: ["Зарплата", "Фриланс", "Бизнес", "Другое"], title: "Life — цели, деньги, день", brand: "Life" });
  // step 1 — name and currency
  await page.fill("#obName", "Алия"); await page.selectOption("#obCur", "тенге"); await page.click("#obNext");
  // step 2 — the goal with two stages
  await page.fill("#obGoal", "Накопить на машину"); await page.fill("#obAmount", "30000"); await page.fill("#obDate", "2027-09-01"); await page.fill("#obMs1", "Отложить 10 000"); await page.fill("#obMs2", "Выбрать машину"); await page.click("#obNext");
  // step 3 — a ready template, one time changed, one debt
  await page.click('[data-ob-tpl="study"]'); await page.fill("#obS0", "08:30"); await page.click(".jl-ob-debt summary"); await page.fill("#obDebt1", "5000"); await page.fill("#obPay", "500"); await page.click("#obNext");
  await page.waitForTimeout(300); await sync(page);
  const r = await page.evaluate(() => ({ open: document.getElementById("modalBack").classList.contains("open"), on: state.settings.onboarded, name: state.profile.name, cur: currencyLabel(), goal: [state.goal.title, state.goal.finance.targetAmount, state.goal.finance.targetDate, state.goal.next], ms: state.goal.milestones.map(m => m.title), steps: state.day.steps.map(x => x.title + " " + x.time), debt: [state.debts.bank, state.debts.monthlyPayment] }));
  assert.deepEqual(r, { open: false, on: true, name: "Алия", cur: "тенге", goal: ["Накопить на машину", 30000, "2027-09-01", "Отложить 10 000"], ms: ["Отложить 10 000", "Выбрать машину"], steps: ["Учёба 08:30", "Домашние задания и дела 15:00", "Итог дня 21:00"], debt: [5000, 500] });
  const c = cloud.row.state;
  assert.deepEqual([c.goal.title, c.goal.milestones.length, c.day.steps[0].time, c.settings.onboarded, c.settings.quoteSet], ["Накопить на машину", 2, "08:30", true, "hadith"], "the setup went to the cloud");
  // never again — not after a reload, not on another device
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true); await sync(page); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open")), false);
  const B = await device(cloud, { onboarding: true }); await sync(B.page); await B.page.waitForTimeout(300);
  assert.equal(await B.page.evaluate(() => document.getElementById("modalBack").classList.contains("open") || state.goal.title), "Накопить на машину");
  // 74: the quote of the day is a hadith for everybody; «Мотивация» is a choice in the settings; «Выключить» hides it
  const q = await page.evaluate(() => { showView("viewToday"); renderToday(); const m = motivation(); return { a: m.author, t: m.text, set: m.set }; });
  assert.match(q.a, /Пророк/); assert.equal(q.set, "hadith");
  const off = await page.evaluate(() => { showView("viewSettings"); const sel = document.getElementById("setQuoteSet"); sel.value = "off"; sel.dispatchEvent(new Event("change")); showView("viewToday"); return document.querySelector(".jl-quote").hidden; });
  assert.equal(off, true, "«Выключить» hides the quote");
  assert.deepEqual(page.errors, []); assert.deepEqual(B.page.errors, []);
  await ctx.close(); await B.ctx.close();
});

await test("73: настройку можно пропустить целиком; закрытое окно больше не появляется", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { onboarding: true });
  await page.waitForSelector("#obSkip", { timeout: 8000 });
  for (let i = 0; i < 3; i++) await page.click("#obSkip");
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ open: document.getElementById("modalBack").classList.contains("open"), on: state.settings.onboarded, goal: state.goal.title, steps: state.day.steps.length, hero: document.getElementById("tgTitle").textContent }));
  assert.deepEqual(r, { open: false, on: true, goal: "", steps: 3, hero: "Задай свою цель" });
  // a second empty account closes the window with «back» — it does not come back either
  const C = await device(makeCloud(), { onboarding: true });
  await C.page.waitForSelector("#obNext", { timeout: 8000 }); await C.page.evaluate(() => closeModal()); await C.page.waitForTimeout(100);
  await sync(C.page); await C.page.waitForTimeout(200);
  assert.deepEqual(await C.page.evaluate(() => [state.settings.onboarded, document.getElementById("modalBack").classList.contains("open")]), [true, false]);
  assert.deepEqual(page.errors, []); assert.deepEqual(C.page.errors, []);
  await ctx.close(); await C.ctx.close();
});

await test("74: хадис дня у всех; «Мотивация» остаётся, только если человек выбрал её сам (миграция quoteSet)", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const withData = normalize({ version: 58, profits: [{ id: "x", amount: 1, at: "2026-01-01T00:00:00Z" }] }).settings.quoteSet;
    const withTasks = normalize({ version: 58, tasks: [{ id: "t", title: "a", date: "2026-01-01" }] }).settings.quoteSet;
    const withReport = normalize({ version: 58, reports: { "2026-01-01": { done: "сделал" } } }).settings.quoteSet;
    const onlyClock = normalize({ version: 58, reports: { "2026-01-01": { steps: { s1: true } } } }).settings.quoteSet; // stage marks set by the clock are not user data
    const empty = normalize({ version: 58 }).settings.quoteSet;
    const chosen = normalize({ version: 58, settings: { quoteSet: "off" }, profits: [{ id: "x", amount: 1 }] }).settings.quoteSet;
    const auto73 = normalize({ version: 58, settings: { quoteSet: "general" } }).settings.quoteSet; // put there by 73, not by the person
    const picked = normalize({ version: 58, settings: { quoteSet: "general", quoteSetChosen: true } }).settings.quoteSet;
    return { withData, withTasks, withReport, onlyClock, empty, chosen, auto73, picked, n: GENERAL_QUOTES.length, uniq: new Set(GENERAL_QUOTES).size };
  });
  assert.deepEqual(r, { withData: "hadith", withTasks: "hadith", withReport: "hadith", onlyClock: "hadith", empty: "hadith", chosen: "off", auto73: "hadith", picked: "general", n: 60, uniq: 60 });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("73: пустой аккаунт со старыми демо-значениями 72 начинает с чистого листа; аккаунт с записями — не трогается", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    // the demo values of ≤72 are recognised by their hash only (they are no longer in the code)
    const demo = { goal: { title: "x", why: "y", next: "z", milestones: [{ id: "m1", title: "a" }] } };
    const kept = normalize({ version: 58, ...demo }).goal.title; // not the demo text → stays
    const withRecords = normalize({ version: 58, income: 4500, debts: { bank: 1e5, firms: 1.2e5, monthlyPayment: 5200 }, expenses: [{ id: "e", amount: 5 }] });
    const emptyDemo = normalize({ version: 58, income: 4500, debts: { bank: 1e5, firms: 1.2e5, monthlyPayment: 5200 } });
    return { kept, withRecords: [withRecords.income, withRecords.debts.bank, withRecords.debts.firms], emptyDemo: [emptyDemo.income, emptyDemo.debts.bank, emptyDemo.debts.firms, emptyDemo.debts.monthlyPayment, emptyDemo.debtBaseline] };
  });
  assert.deepEqual(r, { kept: "x", withRecords: [4500, 100000, 120000], emptyDemo: [0, 0, 0, 0, null] });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("73: пустая цель и нулевой долг — спокойные пустые состояния без NaN/∞; имена долгов можно переименовать", async () => {
  const { ctx, page } = await device(makeCloud());
  const bad = await page.evaluate(() => { const out = [];
    for (const v of ["viewToday", "viewGoal", "viewMoney", "viewProfile"]) { showView(v); const t = document.querySelector(".view.active").innerText; for (const w of ["NaN", "Infinity", "∞", "undefined", "null"]) if (t.includes(w)) out.push(v + ": " + w); }
    for (const o of ["openDebtEdit()", "openDebtHistory('all')", "openMetricDetail('debt')", "openMetricDetail('goal')", "openLifeAnalysis()", "openGoalFinanceEdit()"]) { closeModal(); eval(o); const t = document.getElementById("modal").innerText; for (const w of ["NaN", "Infinity", "∞", "undefined", "null"]) if (t.includes(w)) out.push(o + ": " + w); }
    closeModal(); return out; });
  assert.deepEqual(bad, []);
  assert.equal(await page.evaluate(() => { showView("viewGoal"); return document.getElementById("goalTitle").textContent; }), "Задай свою цель");
  await page.evaluate(() => openDebtEdit());
  await page.fill("#dnb", "Кредит <b>"); await page.fill("#db", "1200"); await page.click("#saveDebtBtn");
  const r = await page.evaluate(() => { showView("viewMoney"); return { label: state.debts.labels.bank, cell: document.querySelector('.jl-debt-cell[data-debt-open="bank"] .label').textContent.trim(), html: document.querySelector('.jl-debt-cell[data-debt-open="bank"] .label').innerHTML.includes("<b>") }; });
  assert.deepEqual(r, { label: "Кредит b", cell: "Кредит b", html: false });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("73: merge() копирует значения по умолчанию — снятая отметка не «воскресает», DEFAULT не меняется", async () => {
  const { ctx, page } = await device(makeCloud());
  const r = await page.evaluate(() => {
    const before = JSON.stringify(DEFAULT);
    const s = normalize({ version: 58, habits: [{ id: "h", title: "Спорт" }] }); // an old state without habitLog
    s.habitLog.h = { "2026-10-16": 1 }; s.goal.milestones.push({ id: "z", title: "чужой" }); s.debts.bank = 7;
    const fresh = normalize({ version: 58 });
    return { same: JSON.stringify(DEFAULT) === before, log: fresh.habitLog, ms: fresh.goal.milestones.length, bank: fresh.debts.bank };
  });
  assert.deepEqual(r, { same: true, log: {}, ms: 0, bank: 0 });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("73 RLS: два аккаунта не видят записи друг друга (life_state, life_state_history, ai_usage)", async () => {
  // a fake Supabase that keeps rows per user and answers only with the caller's own rows (RLS: user_id = auth.uid())
  const A_ID = "aaaaaaaa-0000-0000-0000-000000000001", B_ID = "bbbbbbbb-0000-0000-0000-000000000002";
  const db = { life_state: [], life_state_history: [], ai_usage: [] }, forged = [];
  let seq = 0;
  const tok = id => `x.${b64({ sub: id, email: id.slice(0, 1) + "@test.tj", exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;
  const uidOf = h => { const m = /^Bearer x\.([^.]+)\.s$/.exec(h || ""); return m ? JSON.parse(Buffer.from(m[1], "base64url")).sub : null; };
  const handle = async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method(), cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const send = (st, b) => route.fulfill({ status: st, headers: cors, contentType: "application/json", body: JSON.stringify(b) });
    if (m === "OPTIONS") return send(200, null);
    const uid = uidOf(req.headers().authorization); if (!uid) return send(401, { message: "JWT" });
    const t = url.pathname.replace("/rest/v1/", ""), q = url.searchParams, eq = k => (q.get(k) || "").replace(/^eq\./, "");
    if (url.pathname.startsWith("/functions/")) { db.ai_usage.push({ user_id: uid, at: Date.now() }); return send(200, { ok: true, model: "mock", output_text: "ПЛЮСЫ — да.", sources: [] }); }
    if (!(t in db)) return send(404, {});
    if (q.get("user_id") && eq("user_id") !== uid) forged.push(m + " " + t);
    const mine = db[t].filter(r => r.user_id === uid); // RLS
    if (m === "GET") { let rows = mine; if (q.get("user_id")) rows = rows.filter(r => r.user_id === eq("user_id")); if (q.get("id")) rows = rows.filter(r => r.id === eq("id")); const sel = (q.get("select") || "").split(","); return send(200, rows.map(r => Object.fromEntries(sel.map(k => [k, r[k]])))); }
    const body = JSON.parse(req.postData() || "{}");
    if (m === "POST") { if (body.user_id !== uid) return send(403, { message: "new row violates row-level security policy" });
      if (t === "life_state") { db[t] = db[t].filter(r => r.user_id !== uid); const row = { ...body, updated_at: new Date(Date.now() + ++seq).toISOString() }; db[t].push(row); return send(201, [row]); }
      if (!db[t].some(r => r.user_id === uid && r.day === body.day)) db[t].push({ id: "h" + ++seq, ...body, created_at: new Date().toISOString() }); return send(201, null); }
    if (m === "PATCH") { const row = mine.find(r => r.updated_at === eq("updated_at")); if (!row) return send(200, []); Object.assign(row, body, { updated_at: new Date(Date.now() + ++seq).toISOString() }); return send(200, [row]); }
    if (m === "DELETE") return send(204, null);
    return send(404, {});
  };
  const open = async id => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" }); await ctx.route(/supabase\.co/, handle);
    await ctx.addInitScript(([a, s]) => { localStorage.setItem("LIFE_CONTROL_SUPABASE_AUTH_V1", a); if (!localStorage.getItem("LIFE_CONTROL_V52")) localStorage.setItem("LIFE_CONTROL_V52", s); }, [JSON.stringify({ access_token: tok(id), refresh_token: "r-" + id, token_type: "bearer", user: { id } }), JSON.stringify({ version: 58, settings: { onboarded: true } })]);
    const page = await ctx.newPage(); page.errors = []; page.on("pageerror", e => page.errors.push(e.message)); await page.goto(APP); await page.waitForFunction(() => appReadyForSync === true); return { ctx, page }; };
  const A = await open(A_ID), B = await open(B_ID);
  await A.page.evaluate(() => { state.profits.push({ id: "secretA", amount: 777, sourceGroup: "Зарплата", at: new Date().toISOString(), dateKey: keyDay() }); state.goal.title = "Цель A"; saveState(); });
  await B.page.evaluate(() => { state.notes.push({ id: "secretB", title: "Заметка B", body: "", at: new Date().toISOString(), category: "work" }); saveState(); });
  for (const d of [A, B, A, B]) await sync(d.page);
  await A.page.evaluate(() => { localStorage.removeItem("JL_CLOUD_SNAP_DAY_V72"); return cloudDailySnapshot(cloudAuth() && { id: jwtPayload(cloudAuth().access_token).sub }); });
  await B.page.evaluate(() => { localStorage.removeItem("JL_CLOUD_SNAP_DAY_V72"); return cloudDailySnapshot(cloudAuth() && { id: jwtPayload(cloudAuth().access_token).sub }); });
  await A.page.evaluate(() => callAI({ mode: "ping" }).catch(() => null)); await B.page.evaluate(() => callAI({ mode: "ping" }).catch(() => null)); await B.page.evaluate(() => callAI({ mode: "ping" }).catch(() => null));
  const seenB = await B.page.evaluate(async () => ({ profits: state.profits.map(p => p.id), goal: state.goal.title, copies: (await listCloudCopies()).length,
    other: await supaFetch("/rest/v1/life_state?user_id=eq.aaaaaaaa-0000-0000-0000-000000000001&select=state").catch(e => String(e)),
    otherCopies: await supaFetch("/rest/v1/life_state_history?user_id=eq.aaaaaaaa-0000-0000-0000-000000000001&select=id,day").catch(e => String(e)),
    write: await supaFetch("/rest/v1/life_state?on_conflict=user_id", { method: "POST", body: JSON.stringify({ user_id: "aaaaaaaa-0000-0000-0000-000000000001", state: {} }) }).then(() => "written", e => e.status) }));
  const seenA = await A.page.evaluate(async () => ({ notes: state.notes.map(n => n.id), copies: (await listCloudCopies()).length }));
  assert.deepEqual(seenB, { profits: [], goal: "", copies: 1, other: [], otherCopies: [], write: 403 }, "B sees nothing of A");
  assert.deepEqual(seenA, { notes: [], copies: 1 }, "A sees nothing of B");
  assert.equal(db.life_state.find(r => r.user_id === A_ID).state.profits[0].id, "secretA"); assert.equal(db.life_state.find(r => r.user_id === A_ID).state.goal.title, "Цель A");
  assert.ok(db.life_state.find(r => r.user_id === B_ID).state.notes.some(n => n.id === "secretB") && !JSON.stringify(db.life_state.find(r => r.user_id === B_ID).state).includes("secretA"), "rows stay apart");
  assert.deepEqual([db.ai_usage.filter(r => r.user_id === A_ID).length, db.ai_usage.filter(r => r.user_id === B_ID).length], [1, 2], "AI usage is counted per user");
  assert.deepEqual(forged, ["GET life_state", "GET life_state_history"], "the app itself only asks for its own rows (the two forged reads above are the test's)");
  assert.deepEqual(A.page.errors, []); assert.deepEqual(B.page.errors, []);
  await A.ctx.close(); await B.ctx.close();
});


await test("73: правка во время самой первой выгрузки переживает перезапуск (облачная строка — своя же старая копия)", async () => {
  const cloud = makeCloud(); cloud.postDelay = 4000;
  const { ctx, page } = await device(cloud);
  for (let i = 0; i < 50 && !cloud.row; i++) await page.waitForTimeout(100);
  assert.ok(cloud.row, "the first upload reached the cloud");
  await page.evaluate(() => { state.goal.title = "Своя цель"; state.daily[keyDay()] = { ...(state.daily[keyDay()] || {}), goalDone: { at: new Date().toISOString(), text: "шаг" } }; saveState(); });
  await page.reload(); cloud.postDelay = 0; // closed before the answer of the first upload came
  await page.waitForFunction(() => appReadyForSync === true); await sync(page);
  const r = await page.evaluate(() => ({ title: state.goal.title, done: !!state.daily[keyDay()]?.goalDone, flag: localStorage.getItem("JL_FIRST_PUSH_V73") }));
  assert.deepEqual(r, { title: "Своя цель", done: true, flag: null });
  assert.equal(cloud.row.state.goal.title, "Своя цель", "the edit reached the cloud");
  // someone else's row (another device) on first contact: the cloud still wins, as before
  const other = makeCloud(); other.row = { user_id: UID, state: { version: 58, goal: { title: "Из облака", milestones: [] }, settings: { onboarded: true } }, device_id: "another-device", schema_version: 58, updated_at: other.nextStamp() };
  const B = await device(other); await sync(B.page);
  assert.equal(await B.page.evaluate(() => state.goal.title), "Из облака");
  assert.deepEqual(page.errors, []); assert.deepEqual(B.page.errors, []);
  await ctx.close(); await B.ctx.close();
});

await test("74: живой «Сегодня» — задачи сразу после «Сейчас», итог дня в конце, линия «Сейчас» в задачах, пульс по дням за 14 дней", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T13:30:00+05:00") });
  const r = await page.evaluate(() => {
    const k = keyDay(), y = new Date(); y.setDate(y.getDate() - 1); const ky = keyDay(y);
    state.habits = [{ id: "h1", title: "Зарядка" }]; state.habitLog = { h1: { [ky]: true } };
    state.tasks = [{ id: "a", title: "Утро", time: "08:00", date: k, done: true }, { id: "b", title: "Звонок", time: "18:00", date: k, done: false }, { id: "c", title: "Вчера", time: "09:00", date: ky, done: true }];
    state.reports[ky] = { done: "x", savedAt: y.toISOString(), steps: Object.fromEntries(state.day.steps.map(x => [x.id, true])) }; saveState(); showView("viewToday"); renderAll();
    const kids = [...document.querySelectorAll("#viewToday > .card, #viewToday > .jl-hero")];
    const pos = sel => kids.findIndex(e => e.matches(sel));
    const rows = [...document.querySelectorAll("#taskList > *")].map(e => e.classList.contains("jl-now-line") ? "|" : e.dataset.taskRow);
    const box = document.getElementById("pulseChart");
    return { tasksAfterHero: pos(".jl-hero") === 0 && kids[1].contains(document.getElementById("taskList")), rhythmNext: kids[2].classList.contains("jl-rhythm"), reportLast: pos(".jl-report") === kids.length - 1,
      rows: rows.join(""), dots: box.querySelectorAll(".jl-pc-dot").length, yesterday: pulseOn(ky), view: document.documentElement.dataset.view, sum: box.querySelector(".jl-pc-sum")?.textContent || "" };
  });
  assert.ok(r.tasksAfterHero && r.rhythmNext && r.reportLast, "order: «Сейчас» → задачи → ритм … итог дня в конце " + JSON.stringify(r));
  assert.equal(r.rows, "a|b", "the «Сейчас» line sits between the done morning task and the evening one");
  assert.equal(r.dots, 14, "14 days on the pulse chart"); assert.equal(r.yesterday, 100, "yesterday: task, habit, stages and the closed day all done");
  assert.equal(r.view, "viewToday", "the sky knows which section is open"); assert.match(r.sum, /сегодня/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.1: без повторов — ритм не дублирует «Твой вечер» и «Главное», деньги и цель без лишних строк, версия только в «О приложении»", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T13:30:00+05:00") });
  await page.evaluate(seedGoal);
  const r = await page.evaluate(() => {
    state.goal.finance.targetAmount = 50000; state.goal.finance.savedAmount = 0; state.goal.next = ""; state.goal.milestones[0].done = true;
    state.profits.push({ id: "p1", amount: 8000, sourceGroup: "Зарплата", at: new Date().toISOString(), dateKey: keyDay() });
    state.debts = { ...state.debts, bank: 90000, firms: 10000, monthlyPayment: 4500 }; ensureDebtHistory();
    saveState(); renderAll(); showView("viewToday"); renderToday();
    const steps = state.day.steps, rows = [...document.querySelectorAll("#timeline .jl-rstep")];
    const free = steps.findIndex(s => !isWorkStage(s) && !isCloseStage(s)), close = steps.findIndex(isCloseStage);
    const freeRow = rows[free], closeRow = rows[close];
    const out = {
      freeMainInRhythm: !!freeRow.querySelector(".jl-rstep-main, [data-stage-main]"),
      evening: !!document.querySelector("#freePlan [data-free-goal]"),
      closeMain: closeRow.querySelector(".jl-rstep-main")?.textContent || "", closeNote: closeRow.querySelector(".jl-rstep-note")?.textContent || "",
      workNote: rows[steps.findIndex(isWorkStage)].querySelector(".jl-rstep-note")?.textContent || "",
      cashLine: document.getElementById("todayCashState").hidden, cashText: document.getElementById("todayCashState").textContent,
    };
    document.querySelector("#freePlan [data-free-goal]").click();
    const sid = steps[free].id; out.markBoth = !!dailyState().goalDone && !!dailyState().stageDone?.[sid];
    document.querySelector("#freePlan [data-free-goal]").click();
    out.unmarkBoth = !dailyState().goalDone && !dailyState().stageDone?.[sid];
    stageMainDone(sid, true); renderFreePlan(); out.androidYesShows = document.querySelector("#freePlan [data-free-goal]").getAttribute("aria-pressed") === "true";
    showView("viewGoal"); renderGoal();
    out.next = document.getElementById("goalNext").textContent; out.globalBalance = !!document.getElementById("goalGlobalBalance");
    showView("viewMoney"); renderMoney();
    out.debtCells = [...document.querySelectorAll("#debtSummary [data-debt-open]")].map(b => b.dataset.debtOpen);
    // the version: only in «Настройки → О приложении»
    out.versionPlaces = ["viewToday", "viewGoal", "viewMoney", "viewNotes", "viewSettings"].filter(v => { showView(v); return document.getElementById(v).innerText.includes(APP_VERSION) && !document.getElementById(v).contains(document.getElementById("appVersion")); });
    out.authHasVersion = document.getElementById("authLock").innerText.includes(APP_VERSION);
    out.topHasVersion = (document.querySelector(".topbar, header")?.innerText || "").includes(APP_VERSION);
    return out;
  });
  assert.ok(r.evening && !r.freeMainInRhythm, "the goal step of the free stage is shown once — in «Твой вечер»: " + JSON.stringify(r));
  assert.match(r.closeMain, /Закрыть день/); assert.equal(r.closeNote, "", "«Итог дня»: the note «Закрыть день: …» repeated «Главное»");
  assert.equal(r.workNote, "Главный рабочий блок дня.", "a note that says something new stays");
  assert.ok(r.cashLine && r.cashText === "", "«Касса» repeated the «Баланс» tile: " + r.cashText);
  assert.ok(r.markBoth && r.unmarkBoth && r.androidYesShows, "«Сделал» in the evening and «Да» of the stage are one mark");
  assert.equal(r.next, "Этап 2 из 4: Закрыть кредит за машину", "the next step is the stage in progress");
  assert.ok(!r.globalBalance, "«Касса · Общий капитал» repeated the tiles");
  assert.deepEqual(r.debtCells, ["bank", "firms", "pay", "paid"], "«Всего» repeated «Долг осталось»");
  assert.deepEqual(r.versionPlaces, [], "the version is shown outside «О приложении»"); assert.ok(!r.authHasVersion && !r.topHasVersion);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.1: «Громкие напоминания» — по умолчанию ВКЛ (канал jamal_life_dawn2, USAGE_ALARM), выключение доходит до Android и переживает перезапуск", async () => {
  const cloud = makeCloud();
  const init = () => { window.__calls = []; window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); return k === "bridgeVersion" ? 6 : k === "takeActions" ? "[]" : undefined; } }); };
  const { ctx, page } = await device(cloud, { init });
  const loudCalls = () => page.evaluate(() => __calls.filter(x => x[0] === "setLoudReminders").map(x => x[1]));
  const sw = () => page.evaluate(() => { showView("viewSettings"); const el = document.getElementById("setLoudReminders"), row = document.getElementById("loudRow"); return { checked: el.checked, shown: getComputedStyle(row).display !== "none", label: row.textContent.replace(/\s+/g, " ").trim(), setting: state.settings.loudReminders }; });
  let r = await sw();
  assert.ok(r.shown && r.checked && r.setting === true, "on by default and visible on Android: " + JSON.stringify(r));
  assert.match(r.label, /Громкие напоминания \(как будильник\)/);
  await page.evaluate(() => scheduleNative());
  assert.equal((await loudCalls()).at(-1), true, "the app tells Android: alarm volume");
  await page.click("#loudRow .v-switch");
  r = await sw();
  assert.ok(!r.checked && r.setting === false, "switched off: " + JSON.stringify(r));
  assert.equal((await loudCalls()).at(-1), false, "Android hears «off» right away (notification volume channel)");
  await sync(page);
  await page.reload(); await page.waitForFunction(() => typeof appReadyForSync !== "undefined" && appReadyForSync === true, null, { timeout: 10000 });
  await page.evaluate(() => scheduleNative());
  r = await sw();
  assert.ok(!r.checked && r.setting === false, "after a restart the switch stays off: " + JSON.stringify(r));
  assert.equal((await loudCalls()).at(-1), false, "and Android gets «off» again on start");
  // an account from before 74.1 (no value yet) gets loud reminders; a saved choice is kept
  const mig = await page.evaluate(() => [normalize({ version: 58, settings: {} }).settings.loudReminders, normalize({ version: 58, settings: { loudReminders: false } }).settings.loudReminders]);
  assert.deepEqual(mig, [true, false]);
  // the Android side: loud = channel jamal_life_dawn2 on the alarm stream, quiet = its own channel on the notification stream, both vibrate
  const java = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/NotificationUtil.java"), "utf8");
  assert.ok(/make\(ctx, nm, CHANNEL, "[^"]+", about, AudioAttributes\.USAGE_ALARM\)/.test(java) && java.includes('CHANNEL = "jamal_life_dawn2"'), "loud channel jamal_life_dawn2 uses USAGE_ALARM");
  assert.ok(/make\(ctx, nm, CHANNEL_SOFT, "[^"]+", about, AudioAttributes\.USAGE_NOTIFICATION_EVENT\)/.test(java) && java.includes("isLoud(ctx) ? CHANNEL : CHANNEL_SOFT"), "quiet channel keeps the old notification stream");
  assert.ok(java.includes("ch.enableVibration(true)") && /OLD_CHANNELS = \{"jamal_life_dawn",/.test(java), "vibration on; the old 74.0 channel is removed");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.1: «Через 15 мин» — напоминание повторяется со звуком (веб), на Windows звук играет сама программа (и из трея)", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-16T10:00:00+05:00") });
  await page.evaluate(() => { state.tasks.push({ id: "s1", title: "Позвонить маме", date: keyDay(new Date()), time: "10:00", createdAt: new Date().toISOString() }); saveState();
    window.__snd = 0; const orig = playNotificationSound; window.playNotificationSound = f => { window.__snd++; return orig(f); }; });
  const ok = await page.evaluate(() => applyReminderAction("snooze", "s1"));
  assert.ok(ok, "snooze applied");
  await page.clock.runFor(15 * 60 * 1000 + 30 * 1000);
  const r = await page.evaluate(() => { runScheduler(); return { snd: __snd, log: state.notificationsLog.filter(n => /Позвонить маме/.test(n.title + n.body)).length }; });
  assert.ok(r.log >= 1 && r.snd >= 1, "the reminder came back after 15 minutes with the sound: " + JSON.stringify(r));
  // Windows: with the desktop host the page does not play the sound itself, it asks the host (works with the window hidden)
  const w = await page.evaluate(() => { window.__jlHostSound = 1; const sent = []; window.chrome = { webview: { postMessage: m => sent.push(m) } }; const before = __snd; _lastChimeAt = 0;
    notify("Тест", "текст", "tasks"); return { sent, played: __snd - before }; });
  assert.equal(w.sent.length, 1); assert.equal(w.sent[0].sound, true, "the host is asked to play the sound"); assert.equal(w.played, 0, "no double sound from the page");
  const cs = fs.readFileSync(path.join(ROOT, "desktop/MainWindow.xaml.cs"), "utf8");
  assert.ok(cs.includes("PlayChime()") && cs.includes('"sounds", "jamal-dawn.wav"'), "Windows plays Web/sounds/jamal-dawn.wav");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.2: AI — ответ не пришёл: на любой сбой понятное «что случилось и что делать» по-русски, и разбор без AI", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  const msg = () => page.evaluate(() => callAI({ mode: "life" }).then(() => "OK", e => String(e.message)));
  const cases = [
    ["шлюз 504 (HTML)", { status: 504, type: "text/html", body: "<html>Gateway Timeout</html>" }, /не отвечает \(504\).*Попробуй через минуту/],
    ["лимит ресурсов 546", { status: 546, body: JSON.stringify({ code: "WORKER_LIMIT", message: "Function failed due to not having enough compute resources" }) }, /перегружен.*через минуту/],
    ["500 по-английски", { status: 500, body: JSON.stringify({ message: "Internal Server Error" }) }, /Ошибка на сервере AI \(500\)/],
    ["404 нет функции", { status: 404, body: JSON.stringify({ message: "Requested function was not found" }) }, /не найден/],
    ["пустой ответ", { status: 200, body: JSON.stringify({ ok: true, output_text: "" }) }, /пустой ответ.*ещё раз/],
    ["своя причина сервера", { status: 503, body: JSON.stringify({ error: "Google сейчас перегружен — все модели Gemini заняты. Попробуй через минуту.", reason: "gemini_overloaded" }) }, /Google сейчас перегружен/],
    ["обрыв связи", "abort", /Нет связи с сервером AI.*интернет/],
  ];
  for (const [name, reply, re] of cases) {
    cloud.aiReply = reply; const m = await msg();
    assert.match(m, re, name + ": " + m);
    assert.ok(/[а-яё]/i.test(m) && !/HTTP|undefined|null|Failed to fetch|\[object/i.test(m), name + ": not understandable: " + m);
  }
  // in the window: the reason, and the full review without AI one tap away
  cloud.aiReply = { status: 504, type: "text/html", body: "<html>Gateway Timeout</html>" };
  await page.evaluate(() => openGeminiAnalysis()); await page.click("#aiRunBtn");
  await page.waitForSelector("#aiResult .jl-ai-fail", { timeout: 8000 });
  const box = await page.textContent("#aiResult");
  assert.match(box, /Ответ AI не пришёл/); assert.match(box, /Попробуй через минуту/); assert.ok(await page.isVisible("#localFallbackBtn"));
  await page.evaluate(() => closeModal());
  // the week card keeps the review without AI and says why
  await page.evaluate(() => { showView("viewToday"); return runWeekReview(); });
  assert.match(await page.textContent("#wkText"), /СИЛЬНАЯ СТОРОНА[\s\S]*не отвечает \(504\)/);
  // the server: every failure writes its reason to the logs (no key, no token, no e-mail)
  const ts = fs.readFileSync(path.join(ROOT, "supabase/functions/life-control-ai/index.ts"), "utf8");
  assert.ok(/console\.error\("ai fail", JSON\.stringify\(info\)\)/.test(ts) && (ts.match(/return fail\(/g) || []).length >= 7, "every error answer goes through fail() with a reason");
  // the session expired and cannot be refreshed → «войди снова», not a code (last: the app then asks to log in)
  cloud.aiReply = { status: 401, body: JSON.stringify({ msg: "Invalid JWT" }) }; cloud.failRefresh = true;
  assert.match(await msg(), /Выйди из аккаунта и войди снова/);
  page.errors = page.errors.filter(e => !/401|Supabase 400/.test(e));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.2: график по дням недели — свои часы и выходной; Android получает будильники по дням (маска Пн..Вс), без графика всё как раньше", async () => {
  const init = () => { window.__calls = []; window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); return k === "bridgeVersion" ? 7 : k === "takeActions" ? "[]" : undefined; } }); };
  // 2026-10-16 is a Friday
  const { ctx, page } = await device(makeCloud(), { init, clock: new Date("2026-10-16T08:58:00+05:00") });
  const plain = await page.evaluate(() => { __calls.length = 0; scheduleNative(); return { days: __calls.filter(c => c[0] === "scheduleDailyDays").length, daily: __calls.filter(c => c[0] === "scheduleDaily").map(c => c[1] + "@" + c[2]) }; });
  assert.equal(plain.days, 0, "no weekday schedule → the same daily alarms as before");
  assert.ok(plain.daily.includes("s1@09:00"), JSON.stringify(plain.daily));
  const r = await page.evaluate(() => {
    state.day.week = { "5": { off: true }, "6": { t: [["11:00", "15:00"], ["15:00", "20:00"], ["20:00", "20:30"]] }, "2": { t: [["09:00", "08:00"], ["x", "y"], ["1", "2"]] } };
    state.day.week = normalize(clone(state)).day.week; saveState(); renderAll();
    __calls.length = 0; scheduleNative();
    const masks = __calls.filter(c => c[0] === "scheduleDailyDays").map(c => c[1] + " " + c[2] + " " + c[3]), daily = __calls.filter(c => c[0] === "scheduleDaily").map(c => c[1] + " " + c[2]);
    const sat = new Date("2026-10-17T12:00:00+05:00");
    return { week: state.day.week, off: dayOff(), sub: document.getElementById("rhythmSub").textContent, masks, daily, sat: daySteps(sat).map(s => s.time + "-" + s.end), base: state.day.steps.map(s => s.time), same: daySteps() === daySteps() };
  });
  assert.deepEqual(Object.keys(r.week).sort(), ["5", "6"], "a broken weekday (Tuesday) is dropped, the others are kept");
  assert.ok(r.off && /выходной/.test(r.sub), "Friday is a day off: " + r.sub);
  assert.deepEqual(r.sat, ["11:00-15:00", "15:00-20:00", "20:00-20:30"], "Saturday has its own times");
  assert.deepEqual(r.base, ["09:00", "18:00", "21:30"], "the usual day is not changed");
  assert.ok(r.same, "daySteps() gives the same objects while nothing changes");
  assert.ok(r.masks.some(m => /^s1(@\d)? 09:00 1111001$/.test(m)) && r.masks.some(m => /^s1(@\d)? 11:00 0000010$/.test(m)), "Mon–Thu + Sun at 09:00, Saturday at 11:00, Friday silent: " + r.masks.join(" | "));
  assert.ok(!r.masks.some(m => / \d{7}$/.test(m) && m.endsWith("1111111")), "full weeks go as plain daily alarms");
  // the web side: no stage reminder on the day off
  await page.clock.runFor(3 * 60 * 1000);
  const n = await page.evaluate(() => { state.notificationsLog = []; runScheduler(); return state.notificationsLog.map(x => x.title); });
  assert.ok(!n.some(t => /Работа/.test(t)), "no stage reminders on the day off: " + n.join(" | "));
  // the editor
  await page.evaluate(() => { showView("viewSettings"); openWeekSchedule(); });
  assert.equal(await page.inputValue("#wkMode5"), "off"); assert.equal(await page.inputValue("#wkMode6"), "own");
  await page.selectOption("#wkMode1", "own"); await page.fill("#wkE1_0", "08:00"); await page.click("#wkSave");
  assert.match(await page.textContent("#wkErr"), /Пн: проверь время/);
  await page.fill("#wkE1_0", "13:00"); await page.fill("#wkS1_1", "13:00"); await page.click("#wkSave");
  assert.deepEqual(await page.evaluate(() => state.day.week["1"].t[0]), ["09:00", "13:00"]);
  assert.match(await page.textContent("#setWeekSub"), /Пт выходной/);
  // the Android side knows the mask and strips «@n» for the «Да / Перенести» buttons
  const j = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/AlarmReceiver.java"), "utf8"), m = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/MainActivity.java"), "utf8");
  assert.ok(j.includes("AlarmScheduler.ringsToday(days)") && j.includes("indexOf('@')") && m.includes("scheduleDailyDays(String id, String time, String days"), "Android: weekday masks");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.2: время намаза — пять намазов на «Сегодня» с хадисами, напоминание в каждое время, город и мазхаб в настройках", async () => {
  const init = () => { window.__calls = []; window.AndroidBridge = new Proxy({}, { get: (_, k) => (...a) => { window.__calls.push([k, ...a]); return k === "bridgeVersion" ? 7 : k === "takeActions" ? "[]" : undefined; } }); };
  const { ctx, page } = await device(makeCloud(), { init, clock: new Date("2026-10-21T15:00:00+05:00") });
  const r = await page.evaluate(() => { state.settings.prayerCity = "dushanbe"; showView("viewToday"); renderToday(); const t = prayerTimes(); const f = m => fmtMin(m);
    return { on: prayerOn(), shown: !document.getElementById("prayerBox").hidden, cells: [...document.querySelectorAll("#prayerTimes > div")].map(d => d.textContent), next: document.getElementById("prayerNext").textContent, t: { fajr: f(t.fajr), dhuhr: f(t.dhuhr), asr: f(t.asr), maghrib: f(t.maghrib), isha: f(t.isha) } }; });
  assert.ok(r.on && r.shown, "on with the hadiths");
  assert.equal(r.cells.length, 5); assert.match(r.cells.join(" "), /Фаджр.*Зухр.*Аср.*Магриб.*Иша/);
  // Dushanbe, 21 October: sunrise ≈ 06:40, noon ≈ 12:10, sunset ≈ 17:40 (a few minutes of tolerance)
  const mm = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; }, near = (a, b, d = 6) => Math.abs(mm(a) - mm(b)) <= d;
  assert.ok(near(r.t.dhuhr, "12:10") && near(r.t.maghrib, "17:40") && near(r.t.fajr, "05:11", 10) && near(r.t.asr, "15:55", 10) && near(r.t.isha, "19:02", 10), JSON.stringify(r.t));
  assert.match(r.next, /^Аср в \d\d:\d\d · через \d+ мин · Душанбе$/, r.next);
  const alarms = await page.evaluate(() => { __calls.length = 0; scheduleNativeTasks(); return __calls.filter(c => c[0] === "scheduleOnce" && /^pray_/.test(c[1])).map(c => c[1]); });
  assert.ok(alarms.includes("pray_asr_0") && alarms.includes("pray_fajr_1") && !alarms.includes("pray_fajr_0"), "today's coming prayers and tomorrow's on Android: " + alarms.join(","));
  await page.clock.setSystemTime(new Date(`2026-10-21T${r.t.asr}:20+05:00`));
  const n = await page.evaluate(() => { state.notificationsLog = []; runScheduler(); return state.notificationsLog.map(x => x.title); });
  assert.ok(n.includes("🕌 Время намаза: Аср"), n.join(" | "));
  // settings: the city, the madhab, off
  await page.evaluate(() => showView("viewSettings"));
  await page.selectOption("#setPrayerAsr", "shafii");
  const shafii = await page.evaluate(() => fmtMin(prayerTimes().asr)); assert.ok(mm(shafii) < mm(r.t.asr) - 30, "Shafi'i Asr is earlier: " + shafii);
  await page.selectOption("#setPrayerCity", "khujand"); assert.match(await page.evaluate(() => { showView("viewToday"); renderToday(); return document.getElementById("prayerNext").textContent; }), /Худжанд/);
  await page.evaluate(() => showView("viewSettings")); await page.click("label:has(#setPrayerOn) .v-switch");
  assert.ok(await page.evaluate(() => { showView("viewToday"); renderToday(); return document.getElementById("prayerBox").hidden && state.settings.prayerOn === false && prayerReminders().length === 0; }), "switched off");
  // «Мотивация» or no quotes: prayers are not shown unless switched on by hand
  assert.deepEqual(await page.evaluate(() => { delete state.settings.prayerOn; state.settings.quoteSet = "general"; const a = prayerOn(); state.settings.prayerOn = true; return [a, prayerOn()]; }), [false, true]);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.2: новый доход спрашивает, куда разложить — долг, банк, на руки; без долгов и банков не спрашивает", async () => {
  const { ctx, page } = await device(makeCloud());
  await page.evaluate(() => openMoneyForm("profit")); await page.fill("#moneyAmount", "2000"); await page.click("#saveMoneyBtn");
  await page.waitForTimeout(150);
  assert.ok(!(await page.evaluate(() => document.getElementById("modalBack").classList.contains("open"))), "nothing to split → no question");
  await page.evaluate(() => { state.debts.bank = 9000; state.debts.labels = { bank: "Эсхата", firms: "Брат" }; state.debts.monthlyPayment = 1500; ensureDebtHistory();
    state.budgets = [{ id: "b1", name: "Еда", emoji: "🍞", planned: 1000, tops: [] }]; saveState(); renderAll(); });
  await page.evaluate(() => openMoneyForm("profit")); await page.fill("#moneyAmount", "5000"); await page.click("#saveMoneyBtn");
  await page.waitForSelector("#splSave", { timeout: 4000 });
  const ask = await page.evaluate(() => ({ title: document.querySelector("#modal h2").textContent, rows: [...document.querySelectorAll(".jl-split-row b")].map(b => b.textContent), debt: document.getElementById("spl0").value, hand: document.getElementById("splHand").textContent }));
  assert.equal(ask.title, "Куда разложить деньги?"); assert.deepEqual(ask.rows, ["Эсхата", "Еда", "На руки"], "debts by their own names, the banks, in hand");
  assert.equal(ask.debt, "1500", "the monthly payment is suggested"); assert.match(ask.hand, /3\s500/);
  await page.fill("#spl1", "4000"); assert.ok(await page.isDisabled("#splSave"), "more than came in"); assert.match(await page.textContent("#splHint"), /Больше, чем пришло/);
  await page.fill("#spl1", "1000"); await page.click("#splSave");
  const r = await page.evaluate(() => ({ debt: state.debts.bank, pay: state.expenses.filter(e => e.debtPayment === "bank").map(e => e.amount), tops: state.budgets[0].tops.map(t => t.amount), cash: walletMetrics().cash, spend: monthSum(spendOnly(state.expenses)) }));
  assert.equal(r.debt, 7500); assert.deepEqual(r.pay, [1500]); assert.deepEqual(r.tops, [1000]);
  assert.equal(r.cash, 2000 + 5000 - 1500, "the debt part leaves the wallet, the bank part is a plan of spending"); assert.equal(r.spend, 0, "a debt payment is not «Расход»");
  // «Всё на руки» changes nothing
  await page.evaluate(() => openIncomeSplit(300)); await page.click("#splAllHand");
  assert.equal(await page.evaluate(() => state.debts.bank), 7500);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.2: «Путь к свободе» и праздник за победу; долги своими именами; вечер за 30 секунд", async () => {
  const { ctx, page } = await device(makeCloud());
  // the migration: stops passed before 74.2 count as won (no confetti for the past)
  assert.deepEqual(await page.evaluate(() => [normalize({ version: 58, debts: { bank: 4000, firms: 0 }, debtBaseline: 10000 }).debts.freedomWon, normalize({ version: 58, debts: { bank: 0, firms: 0 }, debtBaseline: 10000 }).debts.freedomWon, normalize({ version: 58, debts: { bank: 0, firms: 0 } }).debts.freedomWon]), [[25, 50], [25, 50, 75, 100], []]);
  await page.evaluate(() => { state.debts.bank = 10000; state.debts.firms = 0; state.debtBaseline = 10000; state.debts.freedomWon = []; state.debts.monthlyPayment = 1000; ensureDebtHistory(); saveState(); window.__party = 0; const c = celebrate; window.celebrate = () => { window.__party++; c(); }; renderAll(); showView("viewMoney"); renderMoney(); });
  let p = await page.evaluate(() => ({ head: document.querySelector("#freedomPath .jl-fpath-head")?.textContent, stops: document.querySelectorAll("#freedomPath .jl-fpath-stops li").length, foot: document.querySelector("#freedomPath .jl-fpath-foot").textContent }));
  assert.match(p.head, /Путь к свободе.*выплачено 0%/); assert.equal(p.stops, 5); assert.match(p.foot, /До победы «25%» — 2\s500.*Свободен от долга/);
  await page.evaluate(() => openTransferForm({ dir: "to-debt", debt: "bank" })); await page.fill("#trAmount", "2600"); await page.click("#trSave"); await page.waitForTimeout(1200);
  p = await page.evaluate(() => ({ won: state.debts.freedomWon, party: __party, toast: document.getElementById("toast").textContent, log: state.notificationsLog.some(n => /Победа: выплачено 25% долга/.test(n.title)), on: document.querySelectorAll("#freedomPath li.on").length }));
  assert.deepEqual(p.won, [25]); assert.equal(p.party, 1, "confetti once"); assert.match(p.toast, /Победа: выплачено 25% долга/); assert.ok(p.log); assert.equal(p.on, 2);
  await page.evaluate(() => renderAll()); await page.waitForTimeout(1100); assert.equal(await page.evaluate(() => __party), 1, "a win is celebrated only once");
  await page.evaluate(() => { openTransferForm({ dir: "to-debt", debt: "bank" }); }); await page.fill("#trAmount", "7400"); await page.click("#trSave"); await page.waitForTimeout(1200);
  p = await page.evaluate(() => ({ won: state.debts.freedomWon, toast: document.getElementById("toast").textContent, head: document.querySelector("#freedomPath .jl-fpath-head").textContent }));
  assert.deepEqual(p.won, [25, 50, 75, 100]); assert.match(p.toast, /Ты свободен от долга/); assert.match(p.head, /ты свободен от долга/);
  // debts by their own names: a placeholder name asks for the real one, the editor starts empty
  await page.evaluate(() => { state.debts.labels = { bank: "Долг 1", firms: "Долг 2" }; state.debts.bank = 500; saveState(); renderMoney(); });
  assert.match(await page.textContent('[data-debt-open="bank"]'), /назови: кому должен/);
  await page.click('[data-debt-open="bank"]'); await page.waitForSelector("#dhEdit"); assert.match(await page.textContent("#dhEdit"), /Назвать и изменить/);
  await page.click("#dhEdit"); await page.waitForSelector("#dnb");
  assert.equal(await page.inputValue("#dnb"), ""); await page.fill("#dnb", "Алиф Банк"); await page.click("#saveDebtBtn");
  assert.deepEqual(await page.evaluate(() => [debtLabel("bank"), debtNamed("bank"), debtLabel("firms")]), ["Алиф Банк", true, "Долг 2"]);
  assert.match(await page.textContent('[data-debt-open="bank"]'), /Алиф Банк[\s\S]*платежи и история/);
  // the evening in 30 seconds: one tap on what got in the way, one tap to close — the day's facts are written by themselves
  await page.evaluate(() => { state.tasks.push({ id: "q1", title: "Отчёт клиенту", date: keyDay(), time: "10:00", done: true }, { id: "q2", title: "Позвонить в банк", date: keyDay(), time: "", done: false }); saveState(); showView("viewToday"); renderToday(); });
  await page.click('[data-qblock="Телефон и соцсети"]'); await page.click("#quickCloseBtn");
  const rep = await page.evaluate(() => state.reports[keyDay()]);
  assert.ok(rep.closedAt, "the day is closed"); assert.match(rep.done, /задачи 1\/2/); assert.equal(rep.block, "Телефон и соцсети"); assert.equal(rep.tomorrow, "Позвонить в банк");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ================= 74.5 =================
const until = async (fn, what, ms = 10000) => { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error("timeout: " + what); await new Promise(r => setTimeout(r, 60)); } };
const aiCalls = cloud => (cloud.aiBodies || []).filter(b => !b.ping).length;
const logTitles = page => page.evaluate(() => state.notificationsLog.map(n => n.title));

await test("74.5: Google занят (503) два раза, потом ответ — «повторю через 2 минуты», повторы через 2 и 5 мин, ответ сохранён, уведомление «AI-анализ готов», лимит потрачен 1 раз; повторное нажатие не создаёт второй запрос", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-21T10:00:00+05:00") });
  await sync(page);
  cloud.aiSeq = ["busy", "timeout"];
  await page.evaluate(() => openGeminiAnalysis()); await page.click("#aiRunBtn");
  await page.waitForSelector("#aiResult .jl-ai-wait", { timeout: 8000 });
  assert.match(await page.textContent("#aiResult"), /Google сейчас занят\. Повторю сам через 2 минуты — пришлю уведомление, когда ответ будет готов/);
  assert.ok(await page.isVisible("#localFallbackBtn"), "the full review without AI stays one tap away");
  assert.ok(!(await page.textContent("#aiResult")).includes("не пришёл"), "no error shown");
  assert.equal(aiCalls(cloud), 1);
  // a second tap while waiting: no second request, «already waiting, retry at HH:MM»
  await page.click("#aiRunBtn"); await page.waitForTimeout(300);
  assert.match(await page.textContent("#aiResult"), /Уже жду ответ, повтор в 10:02/);
  assert.equal(aiCalls(cloud), 1, "a second tap must not send a second request");
  await page.evaluate(() => closeModal());
  await page.clock.fastForward("02:05"); await until(() => aiCalls(cloud) === 2, "retry after 2 min");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => (state.ai.history || []).length), 0);
  assert.ok(await page.evaluate(() => /повтор в 10:07/.test(aiWaitText("life"))), await page.evaluate(() => aiWaitText("life")));
  await page.clock.fastForward("05:05"); await until(() => aiCalls(cloud) === 3, "retry after 5 more min");
  await until(() => page.evaluate(() => (state.ai.history || []).length === 1), "answer saved");
  const titles = await logTitles(page);
  assert.equal(titles.filter(t => t === "AI-анализ готов").length, 1, titles.join(" | "));
  assert.equal(cloud.aiOk, 1, "the limit is spent once — only by the real answer");
  assert.equal(await page.evaluate(() => localStorage.getItem("JL_AI_RETRY_V745")), null, "the queue is empty");
  // a tap on the notice opens the window with the answer
  await page.click("#toast"); await page.waitForSelector("#aiResult .jl-ai-result");
  assert.match(await page.textContent("#modal"), /AI-анализ готов[\s\S]*Ответ/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: три неудачи повтора → одно спокойное итоговое уведомление, без спама; неделя и цель тоже ждут, авто-AI цели — тихо", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-21T10:00:00+05:00") });
  await sync(page);
  cloud.aiSeq = ["busy", "busy", "timeout", "busy"];
  await page.evaluate(() => { state.notificationsLog = []; openGeminiAnalysis(); }); await page.click("#aiRunBtn");
  await page.waitForSelector("#aiResult .jl-ai-wait"); await page.evaluate(() => closeModal());
  for (const [mm, n] of [["02:05", 2], ["05:05", 3], ["15:05", 4]]) { await page.clock.fastForward(mm); await until(() => aiCalls(cloud) === n, "retry " + n); await page.waitForTimeout(250); }
  await page.clock.fastForward("20:00"); await page.waitForTimeout(400);
  assert.equal(aiCalls(cloud), 4, "1 tap + 3 retries, nothing more");
  const titles = await logTitles(page);
  assert.equal(titles.filter(t => t === "AI сегодня перегружен").length, 1, titles.join(" | "));
  assert.ok(!titles.some(t => /AI-анализ готов|AI не ответил/.test(t)), titles.join(" | "));
  assert.match(await page.evaluate(() => state.notificationsLog.find(n => n.title === "AI сегодня перегружен").body), /Попробуй вечером\. Полный разбор работает без AI/);
  // the week review: the same waiting, the review without AI stays on the card
  cloud.aiSeq = ["busy"];
  await page.evaluate(() => { showView("viewToday"); return runWeekReview(); });
  assert.match(await page.textContent("#wkText"), /СИЛЬНАЯ СТОРОНА[\s\S]*Google сейчас занят\. Повторю сам/);
  await page.evaluate(() => runWeekReview()); assert.match(await page.textContent("#wkText"), /Уже жду ответ, повтор в/);
  const before = aiCalls(cloud); await page.clock.fastForward("02:05"); await until(() => aiCalls(cloud) === before + 1, "week retry");
  await until(() => page.evaluate(() => !!state.ai.weekly?.[weekKey()]), "week saved");
  assert.ok((await logTitles(page)).includes("Разбор недели готов"));
  // the automatic goal plan: a silent retry, no notices at all
  await page.evaluate(() => { state.goal.title = "Квартира"; saveState(); state.notificationsLog = []; });
  cloud.aiSeq = ["busy"];
  await page.evaluate(() => requestGoalAI(true));
  assert.ok(await page.evaluate(() => aiJob("goal")?.silent === true));
  const b2 = aiCalls(cloud); await page.clock.fastForward("02:05"); await until(() => aiCalls(cloud) === b2 + 1, "goal retry");
  await until(() => page.evaluate(() => !!state.goal.aiPlan), "goal plan saved");
  assert.deepEqual(await logTitles(page), [], "the automatic goal plan never notifies");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: закрыл и открыл приложение во время ожидания — повтор продолжается; через час после нажатия — уже нет; другие ошибки — без повтора", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-21T10:00:00+05:00") });
  await sync(page);
  cloud.aiSeq = ["busy"];
  await page.evaluate(() => openGeminiAnalysis()); await page.click("#aiRunBtn"); await page.waitForSelector("#aiResult .jl-ai-wait");
  await page.close();
  const p2 = await ctx.newPage(); p2.errors = []; p2.on("pageerror", e => p2.errors.push(e.message));
  await p2.goto(APP); await p2.waitForFunction(() => appReadyForSync === true);
  assert.ok(await p2.evaluate(() => !!aiJob("life")), "the job survived the restart");
  await p2.clock.fastForward("02:05"); await until(() => aiCalls(cloud) === 2, "retry after restart");
  await until(() => p2.evaluate(() => (state.ai.history || []).length === 1), "answer saved after restart");
  assert.ok((await logTitles(p2)).includes("AI-анализ готов"));
  // more than an hour since the first tap: the job is dropped on start
  await p2.evaluate(() => { localStorage.setItem("JL_AI_RETRY_V745", JSON.stringify({ life: { kind: "life", first: Date.now() - 3700e3, tries: 1, next: Date.now() - 1000, opts: {} } })); _aiJobs = null; });
  const b = aiCalls(cloud); await p2.clock.fastForward("00:05"); await p2.waitForTimeout(300);
  assert.equal(aiCalls(cloud), b, "an hour-old job is not retried"); assert.equal(await p2.evaluate(() => aiJob("life")), null);
  // the limit, a dead key, no internet: shown at once, no retry
  cloud.aiFail = true;
  await p2.evaluate(() => openGeminiAnalysis()); await p2.click("#aiRunBtn"); await p2.waitForSelector("#aiResult .jl-ai-fail");
  assert.match(await p2.textContent("#aiResult"), /лимит/i); assert.equal(await p2.evaluate(() => aiJob("life")), null);
  assert.deepEqual(p2.errors, []);
  await ctx.close();
});

await test("74.5: «До свободы от долгов» на «Сегодня» под задачами — тот же расчёт, что «Путь к свободе»; после платежа число меньше и видно «−N дней»; нет долгов — нет строки", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-21T10:00:00+05:00") });
  await page.evaluate(() => { state.debts.bank = 10000; state.debts.firms = 0; state.debts.monthlyPayment = 1000; ensureDebtHistory(); saveState(); showView("viewToday"); renderAll(); });
  let r = await page.evaluate(() => ({ hidden: document.getElementById("todayFreedom").hidden, text: document.getElementById("todayFreedomText").textContent, path: debtFreeLine(),
    afterTasks: document.getElementById("taskList").closest(".card").nextElementSibling?.id }));
  assert.equal(r.hidden, false); assert.equal(r.afterTasks, "todayFreedom", "right under the tasks");
  assert.match(r.text, /^До свободы от долгов: 305 дней \((.+)\)$/, r.text);
  assert.ok(r.path.endsWith(r.text.match(/\((.+)\)/)[1]), "the same date as «Путь к свободе»: " + r.path + " / " + r.text);
  await page.evaluate(() => openTransferForm({ dir: "to-debt", debt: "bank" })); await page.fill("#trAmount", "1000"); await page.click("#trSave");
  await page.evaluate(() => showView("viewToday"));
  r = await page.evaluate(() => ({ text: document.getElementById("todayFreedomText").textContent, delta: document.getElementById("todayFreedomDelta").textContent, on: document.getElementById("todayFreedomDelta").classList.contains("show") }));
  assert.match(r.text, /До свободы от долгов: 274 дня/); assert.equal(r.delta, "−31 день"); assert.ok(r.on, "the «−N дней» is seen");
  await page.clock.runFor(1600); assert.ok(!(await page.evaluate(() => document.getElementById("todayFreedomDelta").classList.contains("show"))), "only for a moment");
  await page.click("#todayFreedom"); assert.equal(await page.evaluate(() => currentView), "viewMoney");
  await page.evaluate(() => { state.debts.bank = 0; saveState(); showView("viewToday"); renderAll(); });
  assert.equal(await page.evaluate(() => document.getElementById("todayFreedom").hidden), true, "no debts — no line");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: зарплата → одно уведомление с именем долга и «Отложил»; «Отложил» пишет обычный платёж; второй раз в месяце — нет; день зарплаты из долгов", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-21T10:00:00+05:00") });
  await page.evaluate(() => { state.debts.bank = 10000; state.debts.monthlyPayment = 1500; state.debts.labels = { bank: "Алиф", firms: "Долг 2" }; ensureDebtHistory(); state.notificationsLog = []; saveState(); renderAll(); });
  const addSalary = async sum => { await page.evaluate(() => openMoneyForm("profit")); await page.selectOption("#moneyType", "Зарплата"); await page.fill("#moneyAmount", String(sum)); await page.click("#saveMoneyBtn");
    await page.waitForSelector("#splSave"); await page.evaluate(() => closeModal()); await page.waitForFunction(() => !document.getElementById("modalBack").classList.contains("open")); }; // the «куда разложить» window comes after a salary
  await addSalary(5000);
  let log = await page.evaluate(() => state.notificationsLog.filter(n => /зарплата/i.test(n.title)));
  assert.equal(log.length, 1); assert.match(log[0].body, /Отложи 1\s500.*на «Алиф» сейчас/);
  await page.evaluate(() => { showView("viewToday"); renderToday(); });
  assert.ok(await page.isVisible("#todaySalary")); assert.match(await page.textContent("#todaySalary"), /Пришла зарплата\? Отложи 1\s500.*«Алиф»/);
  await page.evaluate(() => document.getElementById("todaySalaryBtn").click()); // the fake clock holds animation frames: a direct tap
  const pay = await page.evaluate(() => ({ e: state.expenses.filter(x => x.debtPayment === "bank").map(x => [x.amount, x.category, x.transfer]), left: state.debts.bank, bar: document.getElementById("todaySalary").hidden }));
  assert.deepEqual(pay.e, [[1500, "Платёж по долгу", true]]); assert.equal(pay.left, 8500); assert.equal(pay.bar, true);
  // the button of the notification itself (Android / browser) — once only
  assert.equal(await page.evaluate(() => { applyReminderAction("done", "debtpay:2026-10"); return state.expenses.filter(x => x.debtPayment).length; }), 1, "no double payment");
  await addSalary(3000);
  log = await page.evaluate(() => state.notificationsLog.filter(n => /зарплата/i.test(n.title)));
  assert.equal(log.length, 1, "not twice a month");
  // the day of salary set in «Долги»
  await page.evaluate(() => openDebtEdit()); await page.fill("#dpd", "5"); await page.evaluate(() => document.getElementById("saveDebtBtn").click());
  assert.equal(await page.evaluate(() => state.debts.payday), 5);
  await page.clock.setSystemTime(new Date("2026-11-05T09:30:00+05:00"));
  await page.evaluate(() => { state.notificationsLog = []; checkSalaryDay(); checkSalaryDay(); });
  log = await page.evaluate(() => state.notificationsLog.filter(n => /зарплата/i.test(n.title)));
  assert.equal(log.length, 1, "salary day → one notice"); assert.match(log[0].body, /Алиф/);
  // Android: one «Отложил» button, the web app gets it
  const nu = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/NotificationUtil.java"), "utf8"), ar = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/ActionReceiver.java"), "utf8");
  assert.ok(nu.includes('"Отложил"') && ar.includes('task.startsWith("debtpay:")'), "Android «Отложил»");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: 1-е число — итог месяца по долгу (с платежами и без): одно уведомление и карточка на «Деньгах» на 3 дня", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-11-01T10:00:00+05:00") });
  let r = await page.evaluate(() => { state.debts.bank = 9000; state.debts.monthlyPayment = 1000; state.debtHistory = [{ day: "2026-10-01", total: 10000, at: "2026-10-01T10:00:00Z" }];
    state.expenses.push({ id: "dp1", amount: 1000, at: "2026-10-10T08:00:00Z", dateKey: "2026-10-10", category: "Платёж по долгу", debtPayment: "bank", transfer: true });
    state.notificationsLog = []; delete state.debts.monthSum; saveState(); checkDebtMonth(); checkDebtMonth(); showView("viewMoney"); renderMoney();
    return { log: state.notificationsLog.filter(n => /Итог месяца/.test(n.title)).map(n => n.body), card: document.getElementById("debtMonthSum").textContent, hidden: document.getElementById("debtMonthSum").hidden }; });
  assert.equal(r.log.length, 1, "one notice"); assert.match(r.log[0], /^В октябре погашено 1\s000.*\. Свобода ближе на 30 дней\. Осталось 9\s000/);
  assert.equal(r.hidden, false); assert.match(r.card, /В октябре погашено/);
  await page.clock.setSystemTime(new Date("2026-11-04T12:00:00+05:00"));
  assert.equal(await page.evaluate(() => { renderMoney(); return document.getElementById("debtMonthSum").hidden; }), true, "the card is shown 3 days");
  // no payments in the month: honest
  r = await page.evaluate(() => { state.expenses = []; delete state.debts.monthSum; state.notificationsLog = []; const n = new Date(2026, 10, 2, 10); checkDebtMonth(n); return state.notificationsLog.map(n => n.body); });
  assert.deepEqual(r, ["В октябре платежей по долгу не было — дата свободы сдвинулась на 31 день"]);
  // no debt in that month — no summary
  r = await page.evaluate(() => { state.debts.bank = 0; delete state.debts.monthSum; state.notificationsLog = []; checkDebtMonth(new Date(2026, 10, 1, 10)); return state.notificationsLog.length; });
  assert.equal(r, 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: нет отправки в облако 24 ч или правка ждёт больше часа → строка «Данные не в облаке с …» в шапке; «Отправить сейчас» → строка исчезает; в настройках время отправки", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud, { clock: new Date("2026-10-21T10:00:00+05:00") });
  await sync(page);
  assert.equal(await page.evaluate(() => { renderSyncWarn(); return document.getElementById("syncWarn").hidden; }), true, "all in the cloud — no line");
  await page.evaluate(() => { localStorage.setItem("JL_CLOUD_OK_AT_V745", String(Date.now() - 25 * 3600e3)); renderSyncWarn(); });
  assert.ok(await page.isVisible("#syncWarn")); assert.match(await page.textContent("#syncWarnText"), /^Данные не в облаке с 20 октября 09:00$/);
  await page.click("#syncWarnBtn"); await until(() => page.evaluate(() => document.getElementById("syncWarn").hidden), "line hides after sending");
  // an edit waiting over an hour (the cloud cannot be reached)
  cloud.down = true;
  await page.evaluate(() => { state.notes.push({ id: "w1", title: "ждёт", body: "", at: new Date().toISOString() }); saveState(); markCloudDirty(); localStorage.setItem("JL_CLOUD_DIRTY_SINCE_V745", String(Date.now() - 2 * 3600e3)); renderSyncWarn(); });
  assert.match(await page.textContent("#syncWarnText"), /Данные не в облаке с сегодня 08:00/);
  await page.click("#syncWarnBtn"); await page.waitForTimeout(500); assert.ok(await page.isVisible("#syncWarn"), "still not in the cloud");
  cloud.down = false;
  await page.click("#syncWarnBtn"); await until(() => page.evaluate(() => document.getElementById("syncWarn").hidden), "sent");
  assert.ok(cloud.row.state.notes.some(n => n.id === "w1"));
  await page.evaluate(() => showView("viewSettings")); assert.match(await page.textContent("#cloudPushAt"), /^сегодня \d\d:\d\d$/);
  page.errors = page.errors.filter(e => !/internet|disconnected|Failed to fetch/i.test(e));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: намаз — новый пользователь по Худжанду, выбранный город не меняется", async () => {
  // no fake clock here: it restarts at the same moment on reload, and the newest save would look older than the last one
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  const r = await page.evaluate(() => { showView("viewToday"); renderToday(); return { city: prayerCity(), saved: state.settings.prayerCity, next: document.getElementById("prayerNext").textContent }; });
  assert.equal(r.city, "khujand"); assert.equal(r.saved, undefined, "nothing written for the person"); assert.match(r.next, /Худжанд$/);
  assert.deepEqual(await page.evaluate(() => [PRAYER_CITIES.khujand[1], PRAYER_CITIES.khujand[2]]), [40.28, 69.62]);
  const kept = await page.evaluate(() => { const s = normalize({ version: 58, settings: { prayerCity: "dushanbe", onboarded: true } }); return s.settings.prayerCity; });
  assert.equal(kept, "dushanbe");
  await page.evaluate(() => { state.settings.prayerCity = "dushanbe"; saveState(); });
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.equal(await page.evaluate(() => prayerCity()), "dushanbe");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: тема «Авто» — днём светлая, вечером тёмная (по солнцу города); сохранённая «тёмная» остаётся тёмной", async () => {
  const { ctx, page } = await device(makeCloud(), { clock: new Date("2026-10-21T13:00:00+05:00") });
  assert.equal(await page.evaluate(() => { showView("viewSettings"); return [...document.querySelectorAll("#setTheme option")].map(o => o.textContent).join("/"); }), "Светлая/Тёмная/Авто");
  assert.equal(await page.evaluate(() => [state.settings.theme, document.documentElement.dataset.theme, document.getElementById("setTheme").value].join()), "dark,dark,dark", "the saved dark theme stays dark");
  await page.selectOption("#setTheme", "auto");
  assert.equal(await page.evaluate(() => [state.settings.theme, document.documentElement.dataset.theme].join()), "auto,light", "auto at 13:00 — light");
  await page.clock.setSystemTime(new Date("2026-10-21T21:30:00+05:00")); await page.clock.fastForward("01:05");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "auto at 21:30 — dark");
  await page.clock.setSystemTime(new Date("2026-10-22T06:00:00+05:00")); await page.clock.fastForward("01:05");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "before sunrise — dark");
  await page.clock.setSystemTime(new Date("2026-10-22T08:00:00+05:00")); await page.clock.fastForward("01:05");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light", "after sunrise — light");
  await page.selectOption("#setTheme", "light"); assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.evaluate(() => normalize({ version: 58, settings: { theme: "dark", onboarded: true } }).settings.theme), "dark");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: фото цели — при добавлении и изменении цели можно загрузить фото; уменьшается на устройстве, видно на «Цели» и в списке; битое фото отбрасывается", async () => {
  const cloud = makeCloud();
  const { ctx, page } = await device(cloud);
  await page.evaluate(() => openGoalEditor(""));
  await page.fill("#geName", "Дом у моря");
  await page.setInputFiles("#gePhotoFile", path.join(ROOT, "icon-512.png"));
  await until(() => page.evaluate(() => /^data:image\/jpeg;base64,/.test(geState.photo)), "photo read");
  assert.ok(await page.isVisible("#gePhotoImg")); assert.equal(await page.textContent("#gePhotoPickLabel"), "Заменить фото");
  await page.click("#geSave");
  const g = await page.evaluate(() => { const g = state.goals.find(x => x.title === "Дом у моря"); return { len: (g.photo || "").length, ok: goalPhotoOk(g.photo), img: !!document.querySelector(`[data-goal-open="${g.id}"] .v-goal-ico.has-photo img`) }; });
  assert.ok(g.ok && g.len < 350000, "a small JPEG: " + g.len); assert.ok(g.img, "seen in the list");
  // the main goal: photo in the hero
  await page.evaluate(() => { state.goal.title = "Квартира"; syncMainGoalMirror(); saveState(); openGoalEditor(state.goals.find(x => x.main).id); });
  await page.setInputFiles("#gePhotoFile", path.join(ROOT, "icon-192.png"));
  await until(() => page.evaluate(() => !!geState.photo), "main photo read");
  await page.click("#geSave");
  assert.ok(await page.evaluate(() => { showView("viewGoal"); renderGoal(); const i = document.getElementById("goalPhoto"); return !i.hidden && i.src.startsWith("data:image/jpeg"); }), "main goal photo on «Цели»");
  // remove
  await page.evaluate(() => openGoalEditor(state.goals.find(x => x.main).id)); await page.click("#gePhotoDrop"); await page.click("#geSave");
  assert.ok(await page.evaluate(() => !("photo" in state.goals.find(x => x.main)) && document.getElementById("goalPhoto").hidden));
  // it travels through the cloud; a broken one is dropped by normalize
  await sync(page); assert.ok(cloud.row.state.goals.some(x => x.title === "Дом у моря" && /^data:image\/jpeg/.test(x.photo)));
  await page.reload(); await page.waitForFunction(() => appReadyForSync === true);
  assert.ok(await page.evaluate(() => goalPhotoOk(state.goals.find(x => x.title === "Дом у моря")?.photo)), "the photo is kept after a restart");
  assert.deepEqual(await page.evaluate(() => normalize({ version: 58, goals: [{ id: "a", title: "x", photo: "javascript:alert(1)" }, { id: "b", title: "y", photo: "data:image/png;base64,AAAA" }] }).goals.map(g => "photo" in g)), [false, true]);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await test("74.5: отпечаток — после пальца сразу главный экран, без «Открыто / Подтвердить»", async () => {
  const m = fs.readFileSync(path.join(ROOT, "android/app/src/main/java/com/doxajooon/lifecontrol/MainActivity.java"), "utf8");
  assert.ok(m.includes(".setConfirmationRequired(false)"), "no confirmation step after the finger");
  assert.ok(m.includes('window.__jlUnlocked&&window.__jlUnlocked()'), "the app is told it was unlocked");
  const { ctx, page } = await device(makeCloud());
  assert.equal(await page.evaluate(() => { showView("viewMoney"); window.__jlUnlocked(); return currentView; }), "viewToday");
  assert.equal(await page.evaluate(() => { showView("viewMoney"); openTaskForm(); window.__jlUnlocked(); const v = currentView; closeModal(); return v; }), "viewMoney", "an open window is left as it was");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await browser.close(); server.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
