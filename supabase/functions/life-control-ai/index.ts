import { createClient } from "npm:@supabase/supabase-js@2";
const MODEL="gemini-3.6-flash";
const WINDOW_MS=3600000;
const MAX_REQUESTS_PER_HOUR=10;
const buckets=new Map();
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-life-control","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:CORS});
const clip=(v,n=900)=>String(v??"").trim().slice(0,n);
function rate(id){const now=Date.now(),a=(buckets.get(id)||[]).filter(t=>now-t<WINDOW_MS);if(a.length>=MAX_REQUESTS_PER_HOUR){buckets.set(id,a);return false}a.push(now);buckets.set(id,a);return true}
function scope(s){return{goal:s?.goal!==false,money:s?.money!==false,reports:s?.reports!==false,notes:s?.notes===true,webSearch:s?.webSearch===true}}
function promptRules(){return["Ты — Life Control AI, персональный аналитический агент.","Работай только с фактами из переданных данных Life Control. Не придумывай суммы, даты, достижения, события или причины.","Отделяй факт от предположения.","Дай: что достигнуто, где пользователь сейчас, финансовое состояние, что мешает, что осталось, главный фокус на 7 дней, одно действие на завтра и практический совет.","Для денег показывай арифметику; не обещай гарантированный результат.","Спортивную аналитику не выдавай за гарантированный доход и не советуй ставки для закрытия долгов.","Пиши по-русски, прямо и спокойно.","Не изменяй данные пользователя."].join("\n")}
function context(s,c){
 const o={generated_at:new Date().toISOString(),currency:String(s?.profile?.currency||"сомони")};
 if(c.goal){const g=s?.goal||{},f=g?.finance||{},target=Number(f.targetAmount)||0,saved=Number(f.savedAmount)||0;o.goal={title:clip(g.title,300),why:clip(g.why,900),next:clip(g.next,900),milestones:Array.isArray(g.milestones)?g.milestones.slice(0,20).map(m=>({title:clip(m?.title,300),done:!!m?.done})):[],finance:{target,saved,remaining:Math.max(0,target-saved),pct:target?Math.min(100,Math.round(saved/target*100)):0,targetDate:clip(f.targetDate,40)}}}
 if(c.money){const p=Array.isArray(s?.profits)?s.profits:[],e=Array.isArray(s?.expenses)?s.expenses:[],cut=Date.now()-30*86400000,p30=p.filter(x=>Date.parse(x?.at||"")>=cut),e30=e.filter(x=>Date.parse(x?.at||"")>=cut),inc=p30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),out=e30.reduce((a,x)=>a+Math.max(0,Number(x?.amount)||0),0),src={},cat={};for(const x of p30){const v=String(x?.sourceGroup||x?.source||"Другое"),k=["Зарплата","Фриланс","Спортивная аналитика"].includes(v)?v:"Другое";src[k]=(src[k]||0)+Math.max(0,Number(x?.amount)||0)}for(const x of e30){const k=clip(x?.category||"Другое",80);cat[k]=(cat[k]||0)+Math.max(0,Number(x?.amount)||0)}o.money={cash:Number(s?.wallet?.openingBalance)||0,goalCapital:Number(s?.goal?.finance?.savedAmount)||0,debt:(Number(s?.debts?.bank)||0)+(Number(s?.debts?.firms)||0),bankDebt:Number(s?.debts?.bank)||0,firmsDebt:Number(s?.debts?.firms)||0,monthlyPayment:Number(s?.debts?.monthlyPayment)||0,last30Days:{income:inc,spent:out,net:inc-out},sources:src,expenses_by_category:cat}}
 if(c.reports){const rs=s?.reports&&typeof s.reports==="object"?s.reports:{},r=Object.entries(rs).filter(([d,v])=>v&&new Date(d+"T23:59:59").getTime()>=Date.now()-30*86400000).sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).slice(0,30);o.reports=r.map(([day,v])=>({day,done:clip(v?.done,800),block:clip(v?.block,800),future:clip(v?.future,800),tomorrow:clip(v?.tomorrow,800),steps:v?.steps||{}}))}
 if(c.notes){const ns=Array.isArray(s?.notes)?s.notes:[];o.notes=ns.slice().sort((a,b)=>String(b?.at||"").localeCompare(String(a?.at||""))).slice(0,15).map(n=>({createdAt:n?.at||"",title:clip(n?.title,180),body:clip(n?.body,900)}))}
 return o;
}
function extract(d){const a=[];for(const c of Array.isArray(d?.candidates)?d.candidates:[])for(const p of Array.isArray(c?.content?.parts)?c.content.parts:[])if(typeof p?.text==="string")a.push(p.text);return a.join("\n").trim()}
function grounding(d){const a=[];for(const c of Array.isArray(d?.candidates)?d.candidates:[])for(const x of Array.isArray(c?.groundingMetadata?.groundingChunks)?c.groundingMetadata.groundingChunks:[]){const t=x?.web?.title,u=x?.web?.uri;if(t&&u&&!a.some(v=>v.url===u))a.push({title:t,url:u})}return a.slice(0,8)}
async function getUser(req){const h=req.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;let k="";try{k=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{}k=k||Deno.env.get("SUPABASE_ANON_KEY")||"";if(!k)throw new Error("Supabase publishable key unavailable.");const sb=createClient(Deno.env.get("SUPABASE_URL")!,k,{global:{headers:{Authorization:h}}}),t=h.replace(/^Bearer\s+/i,"");const {data,error}=await sb.auth.getUser(t);if(error||!data?.user)return null;return{sb,user:data.user}}
async function gemini(input,useSearch){
  const key=Deno.env.get("GEMINI_API_KEY")||"";
  if(!key)return{error:"GEMINI_API_KEY не настроен в Supabase Secrets.",status:503};
  
  const payload={
    model:MODEL,
    system_instruction:promptRules(),
    input,
    store:false,
    generation_config:{max_output_tokens:1800,thinking_level:"low"}
  };
  if(useSearch)payload.tools=[{type:"google_search"}];
  let r;
  try{
    r=await fetch("https://generativelanguage.googleapis.com/v1/interactions",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify(payload)
    });
  }catch{return{error:"Не удалось связаться с Gemini Interactions API.",status:502}}
  const raw=await r.text();
  let d={};try{d=JSON.parse(raw||"{}")}catch{}
  if(!r.ok){
    const msg=clip(d?.error?.message||"",900)||("Gemini HTTP "+r.status);
    return{error:msg,status:r.status};
  }
  if(d?.status==="failed"||d?.status==="cancelled"||d?.status==="incomplete")return{error:"Gemini завершил взаимодействие со статусом: "+String(d?.status),status:502};
  let out=typeof d?.output_text==="string"?d.output_text.trim():"";
  if(!out && Array.isArray(d?.steps)){
    const a=[];
    for(const st of d.steps||[]) for(const part of st?.content||[]) if(part?.type==="text"&&typeof part?.text==="string") a.push(part.text);
    out=a.join("\n").trim();
  }
  const sources=[];
  for(const st of Array.isArray(d?.steps)?d.steps:[]) if(st?.type==="model_output") for(const part of Array.isArray(st?.content)?st.content:[]) for(const an of Array.isArray(part?.annotations)?part.annotations:[]) if(an?.type==="url_citation"&&an?.url&&!sources.some(x=>x.url===an.url)) sources.push({title:clip(an?.title||an.url,180),url:an.url});
  return out?{output_text:out,sources:useSearch?sources.slice(0,8):[],interaction_id:d?.id||null}:{error:"Gemini вернул пустой ответ.",status:502};
}
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});try{const a=await getUser(req);if(!a)return json({error:"Требуется авторизация Life Control."},401);if(!rate(a.user.id))return json({error:"Слишком много запросов AI за час. Попробуй позже."},429);if(req.method==="GET")return json({ok:true,configured:Boolean(Deno.env.get("GEMINI_API_KEY")),model:MODEL});if(req.method!=="POST")return json({error:"Method not allowed."},405);const body=await req.json();if(body?.ping===true){const r=await gemini("Ответь одной короткой фразой: Подключение Life Control работает.",false);return r.error?json({error:r.error},r.status):json({ok:true,output_text:r.output_text,model:MODEL,sources:[]})}const sc=scope(body?.scope);const {data:row,error}=await a.sb.from("life_state").select("state,schema_version,updated_at").eq("user_id",a.user.id).maybeSingle();if(error)return json({error:"Не удалось прочитать данные Life Control из Supabase."},500);const ctx=context(row?.state||{},sc),p="Проанализируй данные пользователя Life Control ниже. Ответь по-русски в структуре:\n\n1) ЧТО УЖЕ ДОСТИГНУТО\n2) ГДЕ Я СЕЙЧАС\n3) ФИНАНСОВОЕ СОСТОЯНИЕ\n4) ЧТО МЕШАЕТ\n5) ЧТО ОСТАЛОСЬ\n6) ГЛАВНЫЙ ФОКУС НА 7 ДНЕЙ\n7) ОДНО ДЕЙСТВИЕ ЗАВТРА\n8) ПРАКТИЧЕСКИЙ СОВЕТ\n\nНе выдумывай отсутствующие данные. Если факт не подтверждён — обозначь его как предположение.\n\nДанные:\n"+JSON.stringify(ctx),r=await gemini(p,sc.webSearch);return r.error?json({error:r.error},r.status):json({ok:true,model:MODEL,output_text:r.output_text,sources:r.sources||[],generated_at:new Date().toISOString(),schema_version:row?.schema_version??null})}catch(e){return json({error:e instanceof Error?e.message:"Неизвестная ошибка Edge Function."},500)}});