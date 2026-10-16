// Edge Function life-control-ai, run for real in Node: Deno, the Supabase client and Gemini are mocks.
// Checks every mode, 401 without login, the 10-per-hour limit, model fallback on 429 and Russian errors.
//   node tests/edge.mjs
import { build } from "esbuild";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const db = { usage: 0, state: null, user: { id: "u1" } };
const env = { GEMINI_API_KEY: "test-key", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
let handler = null;
globalThis.Deno = { env: { get: k => env[k] }, serve: fn => { handler = fn; } };
// a tiny thenable query builder: from(table).select().eq().gte() / .maybeSingle() / .insert()
globalThis.__mockCreateClient = () => ({
  auth: { getUser: async t => t === "good" ? { data: { user: db.user }, error: null } : { data: null, error: { message: "bad jwt" } } },
  from: table => {
    const q = { single: false, then: (ok, bad) => Promise.resolve(table === "ai_usage" ? { count: db.usage, error: null } : { data: db.state ? { state: db.state, schema_version: 58, updated_at: "x" } : null, error: null }).then(ok, bad) };
    for (const m of ["select", "eq", "gte"]) q[m] = () => q;
    q.maybeSingle = () => q; q.insert = async () => { db.usage++; return { error: null }; };
    return q;
  },
});
const gem = { calls: [], plan: () => ({ status: 200 }) };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes("/models?")) return new Response(JSON.stringify({ models: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"].map(n => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) }));
  const model = url.match(/models\/([^:]+):generateContent/)?.[1];
  const body = JSON.parse(init.body || "{}"); gem.calls.push({ model, body });
  if (gem.hang) return new Promise((_, bad) => init.signal?.addEventListener("abort", () => bad(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const p = gem.plan(model);
  if (p.status !== 200) return new Response(JSON.stringify({ error: { message: p.message || "Your project has exceeded a quota.", code: p.status } }), { status: p.status });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ПЛЮСЫ — ответ " + model }] } }] }));
};
const out = await build({ entryPoints: [ROOT + "supabase/functions/life-control-ai/index.ts"], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  plugins: [{ name: "mock-supabase", setup(b) { b.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: "sb", namespace: "mock" })); b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const createClient = (...a) => globalThis.__mockCreateClient(...a);", loader: "js" })); } }] });
await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
assert.ok(handler, "Deno.serve was not called");

const call = async (method, body, token = "good") => {
  const r = await handler(new Request("https://x.supabase.co/functions/v1/life-control-ai", { method, headers: token ? { Authorization: "Bearer " + token, "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, body: method === "OPTIONS" ? await r.text() : await r.json(), cors: r.headers.get("access-control-allow-origin") };
};
const results = []; let failed = 0;
async function test(name, fn) { db.usage = 0; gem.calls = []; gem.plan = () => ({ status: 200 }); env.GEMINI_API_KEY = "test-key";
  try { await fn(); results.push(name); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n   ", e.message.split("\n").slice(0, 4).join(" ")); } }
const ru = s => /[а-яё]/i.test(s);

await test("OPTIONS отвечает CORS", async () => { const r = await call("OPTIONS", null, ""); assert.equal(r.status, 200); assert.equal(r.cors, "*"); });
await test("Без входа — 401 по-русски", async () => {
  for (const t of ["", "bad"]) { const r = await call("POST", { mode: "life" }, t); assert.equal(r.status, 401); assert.ok(ru(r.body.error), r.body.error); }
  assert.equal(gem.calls.length, 0, "Gemini must not be called without login");
});
await test("GET — бесплатная проверка без Gemini и без лимита", async () => { const r = await call("GET"); assert.equal(r.status, 200); assert.equal(r.body.configured, true); assert.equal(gem.calls.length, 0); assert.equal(db.usage, 0); });
await test("ping — подключение работает", async () => { const r = await call("POST", { ping: true }); assert.equal(r.status, 200); assert.match(r.body.output_text, /Подключение работает/); });
db.state = { profile: { currency: "сомони" }, profits: [{ amount: 9000, at: new Date().toISOString(), sourceGroup: "Зарплата" }],
  expenses: [{ amount: 300, category: "Еда", at: new Date().toISOString() }, { amount: 4000, category: "Платёж по долгу", debtPayment: "bank", transfer: true, at: new Date().toISOString() }],
  debts: { bank: 90000, firms: 0, monthlyPayment: 4000 }, goal: { title: "Квартира", milestones: [], finance: { targetAmount: 50000 } }, reports: {}, tasks: [], notes: [{ title: "секрет", body: "x", at: new Date().toISOString() }] };
for (const [mode, mark] of [["life", "РЕЖИМ: LIFE"], ["goal", "РЕЖИМ: GOAL"], ["week", "РЕЖИМ: WEEK"], ["deep", "РЕЖИМ: DEEP"]]) {
  await test(`Режим ${mode}: ответ модели и данные пользователя в запросе`, async () => {
    const r = await call("POST", { mode, scope: { goal: true, money: true, reports: true, notes: false }, facts: { cats: [] }, today: "2026-10-16" });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.output_text, /ПЛЮСЫ/); assert.equal(r.body.model, "gemini-flash-latest");
    const prompt = gem.calls[0].body.contents[0].parts[0].text; assert.ok(prompt.includes(mark), "prompt of " + mode);
    assert.ok(/"spent":300\b/.test(prompt) && /"debtPaid":4000\b/.test(prompt), mode + ": debt payments must be apart from spending: " + (prompt.match(/"(spent|debtPaid)":\d+/g) || []).join(","));
    assert.ok(!prompt.includes("секрет"), mode + ": notes were not allowed");
    assert.equal(db.usage, 1, "the request is counted");
  });
}
await test("Квота одной модели (429) → следующая модель", async () => {
  gem.plan = m => m === "gemini-flash-latest" ? { status: 429 } : { status: 200 };
  const r = await call("POST", { mode: "life" }); assert.equal(r.status, 200); assert.equal(r.body.model, "gemini-2.5-flash");
});
await test("Квота у всех моделей → 429 и понятная причина по-русски", async () => {
  gem.plan = () => ({ status: 429 }); const r = await call("POST", { mode: "week" });
  assert.equal(r.status, 429); assert.ok(ru(r.body.error) && /лимит/i.test(r.body.error), r.body.error);
});
await test("Неверный ключ Gemini → понятная ошибка, без перебора всех моделей", async () => {
  gem.plan = () => ({ status: 400, message: "API key not valid. API_KEY_INVALID" }); const r = await call("POST", { mode: "life" });
  assert.ok(r.status >= 400 && ru(r.body.error) && /Ключ Gemini/.test(r.body.error), JSON.stringify(r)); assert.equal(gem.calls.length, 1);
});
await test("Сервис Gemini недоступен (500) → ошибка по-русски", async () => {
  gem.plan = () => ({ status: 500 }); const r = await call("POST", { mode: "deep" }); assert.equal(r.status, 502); assert.ok(ru(r.body.error), r.body.error);
});
await test("Google перегружен (503) → другая модель; занятая модель потом идёт последней", async () => {
  gem.plan = m => m === "gemini-flash-latest" ? { status: 503, message: "This model is currently experiencing high demand." } : { status: 200 };
  let r = await call("POST", { mode: "life" }); assert.equal(r.status, 200); assert.equal(r.body.model, "gemini-2.5-flash");
  gem.calls = []; gem.plan = () => ({ status: 200 }); r = await call("POST", { mode: "life" });
  assert.notEqual(gem.calls[0].model, "gemini-flash-latest", "the overloaded model must wait at the end of the queue");
});
await test("Модель зависла → ответ в пределах общего срока, причина по-русски", async () => {
  env.AI_DEADLINE_MS = "900"; env.AI_ATTEMPT_MS = "300"; gem.hang = true;
  const t = Date.now(); const r = await call("POST", { mode: "life" }); const ms = Date.now() - t;
  gem.hang = false; delete env.AI_DEADLINE_MS; delete env.AI_ATTEMPT_MS;
  assert.ok(ms < 1500, "answered in " + ms + " ms"); assert.equal(r.status, 503); assert.match(r.body.error, /перегружен/);
});
await test("Лимит 10 запросов в час", async () => {
  db.usage = 10; const r = await call("POST", { mode: "life" });
  assert.equal(r.status, 429); assert.match(r.body.error, /лимит 10/); assert.equal(gem.calls.length, 0);
});
await test("Ключ не настроен → 503 по-русски", async () => {
  env.GEMINI_API_KEY = ""; const r = await call("POST", { mode: "life" }); assert.equal(r.status, 503); assert.ok(ru(r.body.error));
});
console.log(`\n${results.length}/${results.length + failed} passed`);
process.exit(failed ? 1 : 0);
