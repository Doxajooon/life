// @ts-nocheck — compact JSON shaping code; runtime is covered by the app tests.
import { createClient } from "npm:@supabase/supabase-js@2";

// Jamal Life AI — analysis of the user's own data with Gemini (generateContent).
// The Gemini key lives only in Supabase Secrets (GEMINI_API_KEY).
// Free-tier quotas are per model, so when one model answers 429 (quota) or is not available
// for this key, the next model is tried automatically. The first model that answers is remembered.
const PREFERRED = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
let MODEL = PREFERRED[0];
let goodModel = "";
let modelList: string[] = [];
let modelListAt = 0;
const MAX_REQUESTS_PER_HOUR = 10;
// Google's 503 «high demand» can hold a request for many seconds: each model gets a time limit, the whole answer
// comes within ~19 s, and a model that just answered 503 waits at the end of the queue for 3 minutes.
const DEADLINE_MS = () => Number(Deno.env.get("AI_DEADLINE_MS")) || 19000;
const ATTEMPT_MS = () => Number(Deno.env.get("AI_ATTEMPT_MS")) || 12000;
const BUSY_MS = 180_000;
const busyUntil: Record<string, number> = {};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-life-control",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: CORS });
const clip = (v: unknown, n = 900) => String(v ?? "").trim().slice(0, n);
const configured = () => Boolean(Deno.env.get("GEMINI_API_KEY"));

function scope(s: any) {
  return { goal: s?.goal !== false, money: s?.money !== false, reports: s?.reports !== false, notes: s?.notes === true, webSearch: s?.webSearch === true };
}

function promptRules() {
  return ["Ты — Jamal Life AI, персональный аналитический агент.","Работай только с фактами из переданных данных Jamal Life. Не придумывай суммы, даты, достижения, события или причины.","Отделяй факт от предположения.","Не давай мелких общих советов вроде «будь дисциплинированнее», «отдыхай больше», «продолжай работать» без конкретного действия.","Каждый вывод должен приводить к практическому решению.","Дай короткий управленческий разбор и затем КОНКРЕТНЫЙ ПЛАН ДЕЙСТВИЙ.","План должен содержать 3–5 действий с приоритетом P1/P2/P3, конкретным сроком, измеримым результатом и основанием из данных.","P1 — действие, которое нужно сделать первым и которое сильнее всего влияет на текущую проблему.","Если есть долги или финансовое давление, отдельно укажи конкретное действие по деньгам: сумму/лимит, срок или правило, только если это можно вывести из данных. Не придумывай возможность платить больше, чем позволяют данные.","Если есть цель, свяжи действия с ближайшим измеримым этапом цели.","Для режима goal обязательно отдельно покажи: ЧТО УЖЕ ДОСТИГНУТО — закрытые этапы и реальные результаты; ЧТО УЖЕ ЕСТЬ — собранный капитал, доступная касса и другие подтверждённые ресурсы; ЧТО МЕШАЕТ — один главный ограничитель; ЗАТЕМ ПЛАН — 3–5 конкретных действий.","Если есть незавершённые задачи или препятствия из отчётов, преврати наиболее существенное препятствие в конкретное действие.","Заверши блоком «ПЕРВОЕ ДЕЙСТВИЕ СЕГОДНЯ» — ровно одно действие, которое пользователь может выполнить сразу.","Не предлагай десять действий. Отсекай второстепенное.","Для денег показывай арифметику; не обещай гарантированный результат.","Спортивную аналитику не выдавай за гарантированный доход и не советуй ставки для закрытия долгов.","Пиши по-русски, прямо, серьёзно и без мотивационной воды.","Не изменяй данные пользователя."].join("\n");
}

// WEEK mode: short Sunday review of the last 7 days (strong side, weak spot, one step).
function weekRules() {
  return ["Ты — Jamal Life AI, личный наставник по итогам недели.","Работай только с фактами из переданных данных за последние 7 дней. Не придумывай суммы, события и причины.","Пиши по-русски, коротко, прямо, по-человечески, без воды и без markdown (#, **, списков).","Спортивную аналитику не выдавай за гарантированный доход и не советуй ставки для закрытия долгов."].join("\n");
}
// deno-lint-ignore no-explicit-any
function weekContext(s: any, today: string): any {
  const since = Date.now() - 7 * 86400000, inWeek = (x: any) => Date.parse(x?.at || "") >= since, amt = (x: any) => Math.max(0, Number(x?.amount) || 0);
  const p = (Array.isArray(s?.profits) ? s.profits : []).filter(inWeek), all = (Array.isArray(s?.expenses) ? s.expenses : []).filter(inWeek);
  // spending = no transfers, no debt payments; a debt payment (stored with transfer:true) goes to money.debtPaid
  const e = all.filter((x: any) => !x?.transfer && !x?.debtPayment), dp = all.filter((x: any) => x?.debtPayment);
  const cat: Record<string, number> = {}; for (const x of e) { const k = clip(x?.category || "Другое", 60); cat[k] = (cat[k] || 0) + amt(x); }
  // Report keys are the user's local dates, so the app sends its own "today".
  const days: any[] = []; const d = new Date((/^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
  for (let i = 0; i < 7; i++) { const k = d.toISOString().slice(0, 10), r = s?.reports?.[k]; days.push({ day: k, closed: !!(r?.closedAt || String(r?.done || "").trim()), done: clip(r?.done, 500), block: clip(r?.block, 500), tomorrow: clip(r?.tomorrow, 300) }); d.setUTCDate(d.getUTCDate() - 1); }
  const tasks = (Array.isArray(s?.tasks) ? s.tasks : []).filter((t: any) => Date.parse((t?.date || "") + "T12:00:00") >= since - 86400000);
  const budgets = (Array.isArray(s?.budgets) ? s.budgets : []).slice(0, 12).map((b: any) => ({ name: clip(b?.name, 60), monthLimit: Number(b?.planned) || 0 }));
  return { currency: String(s?.profile?.currency || "сомони"), goal: clip(s?.goal?.title, 200), days, closedDays: days.filter((x) => x.closed).length,
    money: { income: p.reduce((a: number, x: any) => a + amt(x), 0), spent: e.reduce((a: number, x: any) => a + amt(x), 0), byCategory: cat, debtPaid: dp.reduce((a: number, x: any) => a + amt(x), 0), debt: (Number(s?.debts?.bank) || 0) + (Number(s?.debts?.firms) || 0), monthlyPayment: Number(s?.debts?.monthlyPayment) || 0, limits: budgets },
    tasks: { total: tasks.length, done: tasks.filter((t: any) => t?.done).length, open: tasks.filter((t: any) => !t?.done).slice(0, 10).map((t: any) => clip(t?.title, 120)) } };
}

// DEEP mode: honest money leaks + weak/strong side, from the whole state and the app's own numbers.
function deepRules() {
  return ["Ты — Jamal Life AI, честный личный аналитик денег и дисциплины.","Опирайся только на переданные данные и цифры. Не придумывай суммы и события.","Говори прямо, по-человечески, коротко, с конкретными цифрами из данных. Без воды, без markdown (#, **, списков со звёздочками).","Спортивную аналитику не выдавай за гарантированный доход и не советуй ставки для закрытия долгов."].join("\n");
}
// deno-lint-ignore no-explicit-any
function deepContext(s: any, facts: any): any {
  const c = context(s, { goal: true, money: true, reports: true, notes: false });
  const habits = (Array.isArray(s?.habits) ? s.habits : []).slice(0, 12).map((h: any) => ({ title: clip(h?.title, 60), kind: h?.kind }));
  const banks = (Array.isArray(s?.budgets) ? s.budgets : []).slice(0, 12).map((b: any) => ({ name: clip(b?.name, 60), monthly: Number(b?.planned) || 0 }));
  let f = "";
  try { f = JSON.stringify(facts ?? {}); if (f.length > 24000) f = ""; } catch { f = ""; } // too big → no numbers rather than broken JSON
  return { ...c, habits, banks, app_numbers: f ? JSON.parse(f.endsWith("}") ? f : "{}") : {} };
}

// LIFE mode: the ticked sections + habits, banks, open tasks and the app's own exact numbers.
// deno-lint-ignore no-explicit-any
function lifeContext(s: any, sc: any, facts: any): any {
  const c = context(s, sc);
  if (sc.money) c.banks = (Array.isArray(s?.budgets) ? s.budgets : []).slice(0, 12).map((b: any) => ({ name: clip(b?.name, 60), monthly: Number(b?.planned) || 0 }));
  if (sc.reports) {
    c.habits = (Array.isArray(s?.habits) ? s.habits : []).slice(0, 12).map((h: any) => ({ title: clip(h?.title, 60), kind: h?.kind }));
    const tasks = Array.isArray(s?.tasks) ? s.tasks : [];
    c.tasks = { total: tasks.length, done: tasks.filter((t: any) => t?.done).length, open: tasks.filter((t: any) => !t?.done).slice(0, 10).map((t: any) => clip(t?.title, 120)) };
  }
  let f = "";
  try { f = JSON.stringify(facts ?? {}); if (f.length > 24000) f = ""; } catch { f = ""; } // too big → no numbers rather than broken JSON
  c.app_numbers = f && f.endsWith("}") ? JSON.parse(f) : {};
  return c;
}

// Only the sections the user ticked are sent to the model, trimmed to sane sizes.
// deno-lint-ignore no-explicit-any
function context(s: any, c: any): any {
 const o={generated_at:new Date().toISOString(),currency:String(s?.profile?.currency||"сомони")};
 if(c.goal){const g=s?.goal||{},f=g?.finance||{},target=Number(f.targetAmount)||0,saved=Number(f.savedAmount)||0;o.goal={title:clip(g.title,300),why:clip(g.why,900),next:clip(g.next,900),milestones:Array.isArray(g.milestones)?g.milestones.slice(0,20).map(m=>({title:clip(m?.title,300),done:!!m?.done})):[],achievements:Array.isArray(s?.achievements)?s.achievements.slice().sort((a,b)=>String(b?.at||"").localeCompare(String(a?.at||""))).slice(0,20).map(a=>({at:a?.at||"",text:clip(a?.text,500)})):[],finance:{target,saved,remaining:Math.max(0,target-saved),pct:target?Math.min(100,Math.round(saved/target*100)):0,targetDate:clip(f.targetDate,40)}}}
 if(c.money){const p=Array.isArray(s?.profits)?s.profits:[],e=Array.isArray(s?.expenses)?s.expenses:[],cut=Date.now()-30*86400000,p30=p.filter(x=>Date.parse(x?.at||"")>=cut),e30=e.filter(x=>Date.parse(x?.at||"")>=cut&&!x?.transfer&&!x?.debtPayment),dp30=e.filter(x=>Date.parse(x?.at||"")>=cut&&x?.debtPayment).reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),inc=p30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),out=e30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),src={},cat={};for(const x of p30){const v=String(x?.sourceGroup||x?.source||"Другое"),k=["Зарплата","Фриланс","Спортивная аналитика"].includes(v)?v:"Другое";src[k]=(src[k]||0)+Math.max(0,Number(x?.amount)||0)}for(const x of e30){const k=clip(x?.category||"Другое",80);cat[k]=(cat[k]||0)+Math.max(0,Number(x?.amount)||0)}o.money={cash:Number(s?.wallet?.openingBalance)||0,goalCapital:Number(s?.goal?.finance?.savedAmount)||0,debt:(Number(s?.debts?.bank)||0)+(Number(s?.debts?.firms)||0),bankDebt:Number(s?.debts?.bank)||0,firmsDebt:Number(s?.debts?.firms)||0,monthlyPayment:Number(s?.debts?.monthlyPayment)||0,last30Days:{income:inc,spent:out,debtPaid:dp30,net:inc-out-dp30},sources:src,expenses_by_category:cat}}
 if(c.reports){const rs=s?.reports&&typeof s.reports==="object"?s.reports:{},r=Object.entries(rs).filter(([d,v])=>v&&new Date(d+"T23:59:59").getTime()>=Date.now()-30*86400000).sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).slice(0,30);o.reports=r.map(([day,v])=>({day,done:clip(v?.done,800),block:clip(v?.block,800),future:clip(v?.future,800),tomorrow:clip(v?.tomorrow,800),steps:v?.steps||{}}))}
 if(c.notes){const ns=Array.isArray(s?.notes)?s.notes:[];o.notes=ns.slice().sort((a,b)=>String(b?.at||"").localeCompare(String(a?.at||""))).slice(0,15).map(n=>({createdAt:n?.at||"",title:clip(n?.title,180),body:clip(n?.body,900)}))}
 return o;
}

async function getUser(req: Request) {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  let k = "";
  try { k = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch { /* ignore */ }
  k = k || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!k) throw new Error("Supabase publishable key unavailable.");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, k, { global: { headers: { Authorization: h } } });
  const { data, error } = await sb.auth.getUser(h.replace(/^Bearer\s+/i, ""));
  if (error || !data?.user) return null;
  return { sb, user: data.user };
}

// Rate limit stored in the database (public.ai_usage), so it survives cold starts of the function.
// deno-lint-ignore no-explicit-any
async function allowRequest(sb: any, userId: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await sb.from("ai_usage").select("at", { count: "exact", head: true }).eq("user_id", userId).gte("at", since);
  if (error) return true; // never block the user because of the counter itself
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) return false;
  await sb.from("ai_usage").insert({ user_id: userId });
  return true;
}

const API = "https://generativelanguage.googleapis.com/v1beta";

// Models this key can really use (cached for an hour), ordered by preference.
async function candidates(key: string): Promise<string[]> {
  if (!modelList.length || Date.now() - modelListAt > 3600_000) {
    try {
      const r = await fetch(API + "/models?pageSize=200", { headers: { "x-goog-api-key": key } });
      const d = await r.json().catch(() => ({}));
      const names = (Array.isArray(d?.models) ? d.models : [])
        .filter((m: any) => (m?.supportedGenerationMethods || []).includes("generateContent"))
        .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
        .filter((n: string) => /^gemini-.*flash/.test(n) && !/(image|tts|audio|live|embedding|vision|computer|robotics|thinking-exp)/.test(n));
      if (names.length) { modelList = names; modelListAt = Date.now(); }
    } catch { /* fall back to the static list */ }
  }
  const avail = modelList.length ? modelList : PREFERRED;
  const rank = (n: string) => { const i = PREFERRED.indexOf(n); if (i >= 0) return i; const v = Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0); return 100 - v * 10 + (/lite/.test(n) ? 5 : 0) + (/preview|exp/.test(n) ? 3 : 0); };
  const list = [...new Set(avail)].sort((a, b) => rank(a) - rank(b));
  if (goodModel && list.includes(goodModel)) list.unshift(...list.splice(list.indexOf(goodModel), 1));
  return list.slice(0, 6);
}

function ruError(status: number, raw: string) {
  if (status === 429 || /quota|rate.?limit|exhausted/i.test(raw)) return "Бесплатный лимит Gemini на сегодня исчерпан у всех доступных моделей. Он обновится около 12:00–13:00 по Душанбе. Пока работает «Полный разбор» на телефоне — он считает всё сам, без интернета. Чтобы лимита не было совсем, включи оплату ключа в Google AI Studio (aistudio.google.com → Billing).";
  if (status === 400 && /api key|API_KEY_INVALID/i.test(raw)) return "Ключ Gemini недействителен. Создай новый ключ в Google AI Studio и замени GEMINI_API_KEY в Supabase → Edge Functions → Secrets.";
  if (status === 403) return "Ключ Gemini не имеет доступа к модели. Проверь ключ в Google AI Studio.";
  if (status === 503 || status === 504) return "Google сейчас перегружен — все модели Gemini заняты. Попробуй через минуту. Пока работает «Полный разбор» на телефоне — без AI.";
  return "Gemini сейчас не отвечает (" + status + "). Попробуй через минуту.";
}

async function gemini(input: string, useSearch: boolean, system = promptRules()) {
  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) return { error: "GEMINI_API_KEY не настроен в Supabase Secrets.", status: 503 };
  const body: any = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.6 },
  };
  if (useSearch) body.tools = [{ google_search: {} }];
  let lastStatus = 502, lastRaw = "";
  const t0 = Date.now(), now = Date.now(), all = await candidates(key);
  const order = [...all.filter((m) => !(busyUntil[m] > now)), ...all.filter((m) => busyUntil[m] > now)];
  for (const m of order) {
    const left = DEADLINE_MS() - (Date.now() - t0);
    if (left < Math.min(1500, DEADLINE_MS() / 6)) { console.error("gemini deadline", Date.now() - t0); lastStatus = lastStatus === 429 ? 429 : 503; break; }
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), Math.min(ATTEMPT_MS(), left));
    let r: Response, raw = "";
    try {
      r = await fetch(`${API}/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: ac.signal });
      raw = await r.text();
    } catch {
      const slow = ac.signal.aborted; lastStatus = slow ? 504 : 502; lastRaw = slow ? "timeout" : "network";
      console.error("gemini error", m, lastStatus, lastRaw, Date.now() - t0); if (slow) busyUntil[m] = Date.now() + BUSY_MS; continue;
    } finally { clearTimeout(timer); }
    let d: any = {};
    try { d = JSON.parse(raw || "{}"); } catch { /* ignore */ }
    if (!r.ok) {
      console.error("gemini error", m, r.status, raw.slice(0, 300));
      lastStatus = r.status; lastRaw = raw;
      if (r.status === 503) busyUntil[m] = Date.now() + BUSY_MS;
      if (r.status === 400 && /api key|API_KEY_INVALID/i.test(raw)) break; // a bad key fails on every model
      if (goodModel === m) goodModel = "";
      continue; // 429 quota, 404 unknown model, 403, 5xx → next model
    }
    const cand = d?.candidates?.[0];
    const out = (Array.isArray(cand?.content?.parts) ? cand.content.parts : []).filter((p: any) => typeof p?.text === "string" && !p?.thought).map((p: any) => p.text).join("").trim();
    if (!out) { lastStatus = 502; lastRaw = "empty " + (cand?.finishReason || ""); console.error("gemini empty", m, cand?.finishReason); continue; }
    const sources: { title: string; url: string }[] = [];
    for (const ch of Array.isArray(cand?.groundingMetadata?.groundingChunks) ? cand.groundingMetadata.groundingChunks : []) {
      const u = ch?.web?.uri; if (u && !sources.some((x) => x.url === u)) sources.push({ title: clip(ch?.web?.title || u, 180), url: u });
    }
    goodModel = m; MODEL = m; delete busyUntil[m];
    console.log("gemini ok", m, Date.now() - t0 + "ms");
    return { output_text: out, sources: useSearch ? sources.slice(0, 8) : [], model: m };
  }
  return { error: ruError(lastStatus, lastRaw), status: lastStatus === 429 ? 429 : lastStatus === 503 || lastStatus === 504 ? 503 : 502 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const a = await getUser(req);
    if (!a) return json({ error: "Требуется вход в Jamal Life." }, 401);
    // Health check: answers instantly and costs nothing (no Gemini call, no rate limit).
    if (req.method === "GET") return json({ ok: true, configured: configured(), model: MODEL });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await req.json().catch(() => ({}));
    if (!configured()) return json({ error: "GEMINI_API_KEY не настроен в Supabase Secrets." }, 503);
    if (!(await allowRequest(a.sb, a.user.id))) return json({ error: "Слишком много запросов AI за час (лимит 10). Попробуй позже." }, 429);
    if (body?.ping === true) {
      const t = await gemini("Ответь ровно двумя словами: «AI работает».", false, "Ты отвечаешь коротко по-русски.");
      return "error" in t ? json({ error: t.error }, t.status) : json({ ok: true, model: t.model, output_text: "Подключение работает · модель " + t.model, sources: [] });
    }
    const sc = scope(body?.scope), mode = body?.mode === "goal" ? "goal" : body?.mode === "week" ? "week" : body?.mode === "deep" ? "deep" : "life";
    const { data: row, error } = await a.sb.from("life_state").select("state,schema_version,updated_at").eq("user_id", a.user.id).maybeSingle();
    if (error) return json({ error: "Не удалось прочитать данные Jamal Life из Supabase." }, 500);
    const ctx = mode === "week" ? weekContext(row?.state || {}, String(body?.today || "")) : mode === "deep" ? deepContext(row?.state || {}, body?.facts) : mode === "life" ? lifeContext(row?.state || {}, sc, body?.facts) : context(row?.state || {}, sc);
    const p = mode === "deep"
      ? deepRules() + "\n\nРЕЖИМ: DEEP. Сделай честный разбор ровно пятью блоками, каждый с новой строки, начиная с названия заглавными буквами:\nГДЕ Я ТЕРЯЮ ДЕНЬГИ — 2–3 конкретные утечки с суммами и долей (категории, мелкие траты, перерасход банков, рост расходов).\nСЛАБАЯ СТОРОНА — одна главная слабость с цифрой (привычки, задачи, закрытие дня, траты) и почему она мешает цели.\nСИЛЬНАЯ СТОРОНА — что реально получается, с цифрой.\nНАД ЧЕМ РАБОТАТЬ — три коротких измеримых действия на 7 дней (сумма, количество или время).\nШАГ НА СЕГОДНЯ — одно действие, которое можно сделать прямо сейчас.\nНичего кроме этих пяти блоков. app_numbers — точные расчёты приложения, используй их.\n\nДанные:\n" + JSON.stringify(ctx)
      : mode === "week"
      ? weekRules() + "\n\nРЕЖИМ: WEEK. Подведи итог последних 7 дней ровно тремя блоками, каждый с новой строки и начинается с названия заглавными буквами:\nСИЛЬНАЯ СТОРОНА — 1–2 предложения: что реально получилось, с цифрой или фактом из данных.\nСЛАБОЕ МЕСТО — 1–2 предложения: что чаще всего мешало (смотри block в днях, траты, незакрытые дни и задачи).\nШАГ НА НЕДЕЛЮ — ровно одно конкретное действие на следующие 7 дней, которое можно проверить (время, сумма или количество).\nНичего кроме этих трёх блоков. Если данных почти нет, честно скажи это в СЛАБОМ МЕСТЕ и дай шаг: закрывать день каждый вечер.\n\nДанные:\n" + JSON.stringify(ctx)
      : mode === "goal"
      ? promptRules() + "\n\nРЕЖИМ: GOAL. Проанализируй именно главную цель пользователя. Ответь в строгой структуре:\n\n1) ТЕКУЩЕЕ СОСТОЯНИЕ — 2–3 подтверждённых факта.\n2) ЧТО УЖЕ ДОСТИГНУТО — только закрытые этапы и реальные результаты из данных.\n3) ЧТО УЖЕ ЕСТЬ — капитал в цели, свободная касса, доходы/расходы и другие подтверждённые ресурсы.\n4) ГЛАВНАЯ ПРОБЛЕМА — один главный ограничитель.\n5) ГЛАВНЫЙ ФОКУС — один приоритет на ближайшие 7 дней.\n6) ПЛАН ДЕЙСТВИЙ — 3–5 строк в формате: P1/P2/P3 | действие | срок | измеримый результат | основание.\n7) ПЕРВОЕ ДЕЙСТВИЕ СЕГОДНЯ — ровно одно действие.\n\nНе выдумывай отсутствующие данные. Если цель не имеет суммы или срока, прямо укажи это и дай ближайшее измеримое действие без выдуманной цифры.\n\nДанные:\n" + JSON.stringify(ctx)
      : promptRules() + "\n\nРЕЖИМ: LIFE. Сделай самый полезный честный разбор жизни пользователя. Ответь ровно восемью блоками, каждый с новой строки, название ЗАГЛАВНЫМИ буквами и тире:\nГДЕ Я СЕЙЧАС — 3 главных факта с цифрами (деньги, долг, цель, дисциплина).\nПЛЮСЫ — 2–4 реальные сильные стороны, каждая с цифрой из данных.\nМИНУСЫ — 2–4 слабых места и утечки: где теряются деньги (категории, мелкие траты, перерасход банков), что проседает в дисциплине (незакрытые дни, привычки, задачи). С цифрами.\nКУДА Я ИДУ — прогноз при текущем темпе, с арифметикой: когда будет достигнута цель, когда закроется долг (используй app_numbers.debtFreeLine, если есть), что будет через 3 месяца, если ничего не менять, и что изменится, если исправить главный минус.\nГЛАВНЫЙ РИСК — одна вещь, которая сильнее всего угрожает цели.\nПЛАН НА 7 ДНЕЙ — 3–5 строк: P1/P2/P3 | действие | срок | измеримый результат.\nШАГ НА СЕГОДНЯ — ровно одно действие на сегодня.\nКАК ЛУЧШЕ ИСПОЛЬЗОВАТЬ ПРИЛОЖЕНИЕ — 1–2 конкретных совета, если из данных видно, что чего-то не хватает (не записываются расходы, нет банков, нет привычек, дни не закрываются). Если всего хватает — напиши это одной строкой.\nБез markdown, без звёздочек и решёток. app_numbers — точные расчёты приложения, используй их: dayReport — отчёт сегодняшнего дня (заработал, потратил, куда ушло, что сделано для цели), avoidHabits — привычки-отказы и их серии, wins — победы, goalStage — текущий этап цели и что нужно, чтобы его закрыть. Не выдумывай данные; если чего-то нет, так и скажи.\n\nДанные:\n" + JSON.stringify(ctx);
    const r = mode === "week" ? await gemini(p, false, weekRules()) : mode === "deep" ? await gemini(p, false, deepRules()) : await gemini(p, sc.webSearch);
    if ("error" in r) return json({ error: r.error }, r.status);
    return json({ ok: true, model: r.model || MODEL, output_text: r.output_text, sources: r.sources || [], generated_at: new Date().toISOString(), schema_version: row?.schema_version ?? null });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Неизвестная ошибка функции." }, 500);
  }
});
