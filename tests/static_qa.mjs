import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

const html = read("index.html");
const copies = [
  "public/index.html",
  "android/app/src/main/assets/index.html",
  "desktop-native/web/index.html",
  "desktop/Web/index.html"
];
const fn = read("supabase/functions/life-control-ai/index.ts");
const config = read("supabase/config.toml");
const sw = read("sw.js");
const manifest = read("manifest.webmanifest");
const pkg = JSON.parse(read("package.json"));
const android = read("android/app/src/main/java/com/doxajooon/lifecontrol/MainActivity.java");

assert.equal(pkg.version, "51.0.0", "package version must match V51");
for (const path of copies) {
  assert.equal(read(path), html, `${path} is out of sync with index.html`);
}

const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scriptMatches.length, 1, "index.html must contain exactly one inline script");
assert.doesNotThrow(() => new Function(scriptMatches[0][1]), "main browser script has syntax errors");

for (const required of [
  "SUPABASE_CONFIG",
  "AI_FUNCTION_URL",
  "AUTH_REDIRECT_URL",
  "https://doxajooon.github.io/life/",
  "cloudSignIn",
  "cloudSignUp",
  "cloudRecover",
  "cloudUpdatePassword",
  "recoverySessionFromUrl",
  "requireAuth",
  "lockApp",
  "unlockApp",
  "cloudRefresh",
  "cloudPull",
  "cloudPush",
  "saveState",
  "restoreFromIndexedDB",
  "navigator.serviceWorker"
]) assert.ok(html.includes(required), `missing ${required}`);

for (const forbidden of [
  "OPENAI",
  "gpt-5.6",
  "gemini-2.5-flash",
  "setAiEndpoint",
  "setAiModel",
  "/api/ai",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY"
]) assert.equal(html.includes(forbidden), false, `forbidden/legacy browser reference: ${forbidden}`);

assert.ok(fn.includes("GEMINI_API_KEY"), "Edge Function must read Gemini key from Secrets");
assert.ok(fn.includes("gemini-3.6-flash"), "Edge Function model must be Gemini 3.6 Flash");
assert.ok(fn.includes("/v1/interactions"), "Edge Function must use Gemini Interactions API");
assert.ok(fn.includes("store:false"), "Gemini Interactions must be stateless");
assert.ok(fn.includes("life_state"), "Edge Function must read life_state");
assert.ok(fn.includes("auth.getUser"), "Edge Function must validate the user");
assert.equal(/OPENAI/i.test(fn), false, "legacy OpenAI reference remains in Edge Function");
assert.equal(fn.includes("SUPABASE_SERVICE_ROLE_KEY"), false, "service role key must not be referenced");
assert.ok(config.includes("[functions.life-control-ai]"), "missing Edge Function config");
assert.ok(config.includes("verify_jwt = true"), "AI Edge Function must require JWT");

assert.ok(sw.includes("life-control-v51-jamals-life"), "service worker cache must be V51");
assert.ok(manifest.includes('"start_url": "./index.html"'), "PWA start_url is incorrect");
assert.ok(android.includes("addJavascriptInterface"), "Android bridge missing");
assert.ok(android.includes("scheduleDaily"), "Android notification bridge missing");

assert.equal(html.includes("cloudLoginBtn"), false, "settings must not show login button after auth");
assert.equal(html.includes("cloudResetBtn"), false, "settings must not show password reset controls");
assert.equal(html.includes("cloudSyncBtn"), false, "settings must not show manual sync button");
assert.equal(html.includes("testAiBtn"), false, "settings must not show manual AI check button");
assert.equal(html.includes("aiTestBtn"), false, "AI analysis modal must not show manual connection check");
assert.ok(html.includes("cloudAutoSync"), "automatic cloud sync missing");
assert.ok(html.includes("refreshAIHealth"), "automatic AI health check missing");
assert.ok(html.includes("cloudNetworkState"), "cloud network status missing");
assert.ok(html.includes("id=\"controlDashboard\""), "control dashboard missing");
assert.ok(html.includes("dashCash") && html.includes("dashDebt") && html.includes("dashGoal") && html.includes("dashDiscipline"), "dashboard indicators missing");
assert.ok(html.includes("renderControlDashboard"), "dashboard renderer missing");
assert.ok(html.includes("calendarRangeMetrics"), "calendar range metrics missing");
assert.ok(html.includes("calendarRangeStart") && html.includes("calendarRangeEnd"), "calendar range selection missing");
assert.ok(html.includes("goalAiCard") && html.includes("requestGoalAI"), "goal AI panel missing");
assert.ok(html.includes("autoCompleteExpiredStages"), "automatic stage completion missing");
assert.ok(html.includes("goalAiBtn"), "goal AI refresh button missing");
assert.ok(html.includes("Пророк Мухаммад ﷺ"), "Prophet motivation quotes missing");
assert.equal(/Маркус Аврелий|Сенека|Конфуций|Имам аш-Шафии|Умар ибн аль-Хаттаб|Али ибн Абу Талиб/.test(html), false, "non-Prophet motivation source remains");
assert.ok(fn.includes('body?.mode==="goal"'), "goal AI mode missing in Edge Function");
assert.ok(fn.includes("achievements"), "goal AI must receive achievements");
assert.ok(html.includes('pulseDayCard') && html.includes('dayProgressMetrics') && html.includes('runner-runner'), "interactive day progress runner missing");
assert.ok(html.includes('authProgressText') && html.includes('authProgressBar') && html.includes('auth-spinner'), "auth progress UI missing");
assert.ok(html.includes('fontScale'), "saved UI font setting missing");
const schedulerMatch = html.match(/function runScheduler\(\)\{([\s\S]*?)\n\}/);
assert.ok(schedulerMatch, "scheduler function missing");
assert.equal(/state\.(debts|profits|expenses)\s*(?:\[[^\]]+\]\s*)?=|state\.(profits|expenses)\.push\(/.test(schedulerMatch[1]), false, "scheduler must not mutate financial records");
assert.ok(html.includes("end_' + s.id") || html.includes("end_'+s.id"), "end-stage native notification missing");
assert.equal((html.match(/let calendarRangeStart/g)||[]).length, 1, "calendar range state must be declared once");
assert.ok(html.includes("LIFE_CONTROL_V46") && html.includes("LIFE_CONTROL_V45"), "V45/V46 local migration keys missing");
assert.ok(html.includes("s.settings.fontScale=clamp"), "fontScale normalization missing");


assert.ok(html.includes("const stored=cloudAuth()"), "persistent Supabase session restore missing");
assert.ok(html.includes("async function cloudLogout()"), "explicit cloud logout function missing");
assert.equal(html.includes("Security policy: a page reload never unlocks Life Control"), false, "old forced-login policy remains");
assert.ok(html.includes("function effectiveDayMode()"), "automatic day mode logic missing");
assert.ok(html.includes("function dayMood()"), "automatic day mood logic missing");
assert.ok(html.includes("function openMetricDetail("), "interactive KPI detail modal missing");
assert.ok(html.includes("function playNotificationSound()"), "in-app notification sound missing");
assert.ok(html.includes("cloudLogout()"), "manual logout action missing");


assert.ok(html.includes("V50 UX hardening"), "V50 UX hardening styles missing");
assert.ok(html.includes("touch-action:manipulation"), "mobile navigation touch optimization missing");
assert.ok(html.includes("transform:translateZ(0)"), "bottom navigation compositor stabilization missing");
assert.ok(html.includes("requestAnimationFrame(()=>window.scrollTo(0,0))"), "view switching must reset scroll after layout");

console.log("LIFE_CONTROL_V50_STATIC_QA_OK");

assert.ok(html.includes("stateFingerprint"), "change-driven persistence fingerprint missing");
assert.ok(html.includes("async function importJSON"), "safe JSON import missing");
assert.ok(html.includes("async function forgetDeletedNoteFromSnapshots"), "permanent note snapshot cleanup missing");
assert.equal(html.includes("setInterval(()=>{if(document.visibilityState==='visible')saveState()},5000)"), false, "periodic blind save must not exist");
assert.ok(html.includes("_cloudBaseUpdatedAt"), "cloud base revision guard missing");
assert.ok(html.includes("Данные обновлены в облаке"), "cloud conflict protection notice missing");
assert.ok(html.includes("gateLoginBtn") && html.includes("gatePassword"), "password auth gate missing");

assert.ok(html.includes("JAMAL`S LIFE"), "brand must be Jamal`s Life");
assert.ok(html.includes("id=\"dayModeAuto\""), "automatic rhythm indicator missing");
assert.ok(html.includes("V51 stable interaction layer"), "V51 interaction layer missing");
assert.equal(html.includes("id=\"dayMode\""), false, "manual day mode selector must not override automatic rhythm");
assert.ok(html.includes("data-metric=\"cash\"") && html.includes("data-metric=\"debt\"") && html.includes("data-metric=\"goal\"") && html.includes("data-metric=\"discipline\""), "Today KPIs must be interactive");
