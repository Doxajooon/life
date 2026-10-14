// @ts-nocheck — compact JSON shaping code; runtime is covered by the app tests.
import { createClient } from "npm:@supabase/supabase-js@2";

// Jamal Life AI — analysis of the user's own data with Gemini (Interactions API).
// The Gemini key lives only in Supabase Secrets (GEMINI_API_KEY).
const MODEL = "gemini-3.6-flash";
const MAX_REQUESTS_PER_HOUR = 10;
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

// Only the sections the user ticked are sent to the model, trimmed to sane sizes.
// deno-lint-ignore no-explicit-any
function context(s: any, c: any): any {
 const o={generated_at:new Date().toISOString(),currency:String(s?.profile?.currency||"сомони")};
 if(c.goal){const g=s?.goal||{},f=g?.finance||{},target=Number(f.targetAmount)||0,saved=Number(f.savedAmount)||0;o.goal={title:clip(g.title,300),why:clip(g.why,900),next:clip(g.next,900),milestones:Array.isArray(g.milestones)?g.milestones.slice(0,20).map(m=>({title:clip(m?.title,300),done:!!m?.done})):[],achievements:Array.isArray(s?.achievements)?s.achievements.slice().sort((a,b)=>String(b?.at||"").localeCompare(String(a?.at||""))).slice(0,20).map(a=>({at:a?.at||"",text:clip(a?.text,500)})):[],finance:{target,saved,remaining:Math.max(0,target-saved),pct:target?Math.min(100,Math.round(saved/target*100)):0,targetDate:clip(f.targetDate,40)}}}
 if(c.money){const p=Array.isArray(s?.profits)?s.profits:[],e=Array.isArray(s?.expenses)?s.expenses:[],cut=Date.now()-30*86400000,p30=p.filter(x=>Date.parse(x?.at||"")>=cut),e30=e.filter(x=>Date.parse(x?.at||"")>=cut),inc=p30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),out=e30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),src={},cat={};for(const x of p30){const v=String(x?.sourceGroup||x?.source||"Другое"),k=["Зарплата","Фриланс","Спортивная аналитика"].includes(v)?v:"Другое";src[k]=(src[k]||0)+Math.max(0,Number(x?.amount)||0)}for(const x of e30){const k=clip(x?.category||"Другое",80);cat[k]=(cat[k]||0)+Math.max(0,Number(x?.amount)||0)}o.money={cash:Number(s?.wallet?.openingBalance)||0,goalCapital:Number(s?.goal?.finance?.savedAmount)||0,debt:(Number(s?.debts?.bank)||0)+(Number(s?.debts?.firms)||0),bankDebt:Number(s?.debts?.bank)||0,firmsDebt:Number(s?.debts?.firms)||0,monthlyPayment:Number(s?.debts?.monthlyPayment)||0,last30Days:{income:inc,spent:out,net:inc-out},sources:src,expenses_by_category:cat}}
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

async function gemini(input: string, useSearch: boolean) {
  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) return { error: "GEMINI_API_KEY не настроен в Supabase Secrets.", status: 503 };
  // deno-lint-ignore no-explicit-any
  const payload: any = {
    model: MODEL,
    system_instruction: promptRules(),
    input,
    store: false,
    thinking_level: "low",
    generation_config: { max_output_tokens: 1800 },
  };
  if (useSearch) payload.tools = [{ type: "google_search" }];
  let r: Response;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });
  } catch {
    return { error: "Не удалось связаться с Gemini.", status: 502 };
  }
  const raw = await r.text();
  // deno-lint-ignore no-explicit-any
  let d: any = {};
  try { d = JSON.parse(raw || "{}"); } catch { /* ignore */ }
  if (!r.ok) return { error: clip(d?.error?.message || "", 900) || "Gemini HTTP " + r.status, status: r.status };
  if (d?.status && d.status !== "completed") return { error: "Gemini не завершил ответ (статус: " + String(d.status) + ").", status: 502 };
  const parts: string[] = [];
  const sources: { title: string; url: string }[] = [];
  for (const st of Array.isArray(d?.steps) ? d.steps : []) {
    for (const part of Array.isArray(st?.content) ? st.content : []) {
      if (part?.type === "text" && typeof part?.text === "string") parts.push(part.text);
      for (const an of Array.isArray(part?.annotations) ? part.annotations : []) {
        if (an?.type === "url_citation" && an?.url && !sources.some((x) => x.url === an.url)) sources.push({ title: clip(an?.title || an.url, 180), url: an.url });
      }
    }
  }
  const out = (typeof d?.output_text === "string" ? d.output_text : parts.join("\n")).trim();
  return out ? { output_text: out, sources: useSearch ? sources.slice(0, 8) : [] } : { error: "Gemini вернул пустой ответ.", status: 502 };
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
    if (body?.ping === true) {
      return configured()
        ? json({ ok: true, model: MODEL, output_text: "Подключение Jamal Life AI работает.", sources: [] })
        : json({ error: "GEMINI_API_KEY не настроен в Supabase Secrets." }, 503);
    }
    if (!(await allowRequest(a.sb, a.user.id))) return json({ error: "Слишком много запросов AI за час. Попробуй позже." }, 429);
    const sc = scope(body?.scope), mode = body?.mode === "goal" ? "goal" : "life";
    const { data: row, error } = await a.sb.from("life_state").select("state,schema_version,updated_at").eq("user_id", a.user.id).maybeSingle();
    if (error) return json({ error: "Не удалось прочитать данные Jamal Life из Supabase." }, 500);
    const ctx = context(row?.state || {}, sc);
    const p = mode === "goal"
      ? promptRules() + "\n\nРЕЖИМ: GOAL. Проанализируй именно главную цель пользователя. Ответь в строгой структуре:\n\n1) ТЕКУЩЕЕ СОСТОЯНИЕ — 2–3 подтверждённых факта.\n2) ЧТО УЖЕ ДОСТИГНУТО — только закрытые этапы и реальные результаты из данных.\n3) ЧТО УЖЕ ЕСТЬ — капитал в цели, свободная касса, доходы/расходы и другие подтверждённые ресурсы.\n4) ГЛАВНАЯ ПРОБЛЕМА — один главный ограничитель.\n5) ГЛАВНЫЙ ФОКУС — один приоритет на ближайшие 7 дней.\n6) ПЛАН ДЕЙСТВИЙ — 3–5 строк в формате: P1/P2/P3 | действие | срок | измеримый результат | основание.\n7) ПЕРВОЕ ДЕЙСТВИЕ СЕГОДНЯ — ровно одно действие.\n\nНе выдумывай отсутствующие данные. Если цель не имеет суммы или срока, прямо укажи это и дай ближайшее измеримое действие без выдуманной цифры.\n\nДанные:\n" + JSON.stringify(ctx)
      : promptRules() + "\n\nРЕЖИМ: LIFE. Проанализируй систему пользователя в строгой структуре:\n\n1) ТЕКУЩЕЕ СОСТОЯНИЕ — максимум 3 факта.\n2) ГЛАВНАЯ ПРОБЛЕМА — одна проблема, которая сейчас сильнее всего ограничивает движение.\n3) ФИНАНСОВАЯ СИТУАЦИЯ — только подтверждённые цифры и арифметика.\n4) ГЛАВНЫЙ ФОКУС НА 7 ДНЕЙ — один приоритет.\n5) ПЛАН ДЕЙСТВИЙ — 3–5 конкретных действий в формате: P1/P2/P3 | действие | срок | измеримый результат | основание.\n6) ПЕРВОЕ ДЕЙСТВИЕ СЕГОДНЯ — одно действие, без альтернатив.\n7) КОНТРОЛЬНАЯ ТОЧКА — что проверить через 7 дней и по какому числу/факту понять результат.\n\nНе выдумывай отсутствующие данные. Если для конкретного действия не хватает данных, прямо укажи, чего не хватает, вместо выдумывания.\n\nДанные:\n" + JSON.stringify(ctx);
    const r = await gemini(p, sc.webSearch);
    if ("error" in r) return json({ error: r.error }, r.status);
    return json({ ok: true, model: MODEL, output_text: r.output_text, sources: r.sources || [], generated_at: new Date().toISOString(), schema_version: row?.schema_version ?? null });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Неизвестная ошибка функции." }, 500);
  }
});
