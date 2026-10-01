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
const androidGradle = read("android/app/build.gradle");

assert.equal(pkg.version, "57.0.0", "package version must match V57");
assert.match(androidGradle, /versionCode 570\b/, "Android versionCode must match V57");
assert.match(androidGradle, /versionName '57\.0'/, "Android versionName must match V57");
for (const path of copies) {
  assert.equal(read(path), html, `${path} is out of sync with index.html`);
}

const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scriptMatches.length, 1, "index.html must contain exactly one inline script");
assert.ok(html.includes("function showView(id)"), "navigation function missing");
for (const view of ["viewToday","viewGoal","viewMoney","viewNotes"]) assert.ok(html.includes(`data-view="${view}"`) && html.includes(`id="${view}"`), `navigation view missing: ${view}`);
assert.equal((html.match(/data-view="view(?:Today|Goal|Money|Notes)"/g)||[]).length, 4, "main navigation must contain exactly four view buttons");
assert.ok(/html\{[^}]*overflow-y:auto!important/.test(html), "document wheel scrolling must remain enabled");
assert.equal(html.includes("life-control-v50"), false, "stale V50 runtime channel remains");
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

assert.ok(sw.includes("life-control-v57"), "service worker cache must be V57");
assert.ok(manifest.includes('"start_url": "./index.html"'), "PWA start_url is incorrect");
assert.ok(android.includes("addJavascriptInterface"), "Android bridge missing");
assert.ok(android.includes("WebViewAssetLoader"), "Android asset loader missing");
assert.ok(android.includes("setDomStorageEnabled(true)"), "Android DOM storage missing");
assert.ok(android.includes("setAcceptThirdPartyCookies"), "Android cookie support missing");
assert.ok(android.includes("doxajooon.github.io"), "Android auth redirect handler missing");
assert.ok(android.includes("Supabase"), "Android Supabase integration comments missing");
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
assert.ok(html.includes('pulseDayCard') && html.includes('pulseDiscipline') && html.includes('dayProgressMetrics') && html.includes('runner-runner'), "interactive day progress runner missing");
assert.ok(html.includes("state.version=57"), "runtime state version must be V57");
assert.equal(/state\.version=5[56]\b/.test(html), false, "stale runtime state version remains");
assert.ok(html.includes("schema_version:57"), "cloud schema version must be V57");
assert.equal(/schema_version:5[56]\b/.test(html), false, "stale cloud schema version remains");
assert.equal(html.includes("life-control-v55-1"), false, "stale BroadcastChannel remains");
assert.ok(html.includes("setInterval(runCloudHeartbeat,15000)"), "cloud heartbeat must not poll every second");
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

assert.equal(html.includes("setTimeout(()=>openPasswordRecovery(),120)"), false, "password recovery must never auto-open");
assert.equal(html.includes("LIFE_CONTROL_RECOVERY_PROMPT_V1"), false, "legacy automatic recovery prompt flag must be gone");
assert.ok(html.includes("modal-back.open{overflow-y:auto"), "modal backdrop scrolling hardening missing");
assert.ok(html.includes("max-height:min(92dvh,92vh)"), "modal viewport sizing missing");
assert.ok(html.includes("env(safe-area-inset-bottom"), "safe-area bottom padding missing");

console.log("LIFE_CONTROL_V56_STATIC_QA_OK");

assert.ok(html.includes("stateFingerprint"), "change-driven persistence fingerprint missing");
assert.ok(html.includes("async function importJSON"), "safe JSON import missing");
assert.ok(html.includes("async function forgetDeletedNoteFromSnapshots"), "permanent note snapshot cleanup missing");
assert.equal(html.includes("setInterval(()=>{if(document.visibilityState==='visible')saveState()},5000)"), false, "periodic blind save must not exist");
assert.ok(html.includes("_cloudBaseUpdatedAt"), "cloud base revision guard missing");
assert.ok(html.includes("Данные обновлены в облаке"), "cloud conflict protection notice missing");
assert.ok(html.includes("gateLoginBtn") && html.includes("gatePassword"), "password auth gate missing");
assert.ok(html.includes('id="addProfitBtn"'), "profit button id is malformed or missing");
assert.equal(/id="addProfitBtn[^"]*</.test(html), false, "malformed profit button id remains");
assert.ok(html.includes("moneyViewDate"), "historical money day state missing");
assert.ok(html.includes("moneyDateIso"), "historical money date helper missing");
assert.ok(html.includes("openMoneyEdit"), "money edit handler missing");
assert.ok(html.includes('id="moneyDate"'), "money edit date control missing");
assert.ok(html.includes('id="moneyNextDay"') && html.includes('id="moneyPrevDay"'), "money day navigation missing");
assert.equal(/V52 delegated navigation|V54 reliable wheel fallback|mobileScrollGuard/.test(html), false, "legacy capture navigation/touch guards remain");
assert.ok(html.includes(".ui-icon{pointer-events:none"), "icons must not intercept button pointer events");


// ---- V56.1 regression guards (found in audit) ----
const symbolIds = new Set([...html.matchAll(/<symbol[^>]*\sid="([^"]+)"/g)].map(m => m[1]));
const usedIcons = new Set([...html.matchAll(/<use href="#(i-[a-z0-9-]+)"/g)].map(m => m[1]));
for (const icon of usedIcons) assert.ok(symbolIds.has(icon), `icon used but not defined in the sprite: ${icon}`);
for (const id of ["debtChart", "debtChartNote", "moneyBestDayTitle", "moneyBestDayText", "moneyBestDayPct", "moneyBestDayBar"]) {
  assert.ok(html.includes(`id="${id}"`), `markup for rendered element missing: ${id}`);
}
assert.ok(html.includes("renderDebtChart();"), "debt chart renderer is never called");
assert.ok(html.includes("prefers-reduced-motion:reduce){*,*::before"), "global reduced-motion guard missing");
assert.ok(html.includes("AndroidBridge.setTheme"), "Android system bar theme sync missing");
for (const f of ["sw.js", "manifest.webmanifest", "icon.svg"]) {
  for (const dir of ["public", "android/app/src/main/assets", "desktop-native/web", "desktop/Web"]) {
    assert.equal(read(`${dir}/${f}`), read(f), `${dir}/${f} differs from root ${f}`);
  }
}
const workflow = read(".github/workflows/release.yml");
assert.equal(workflow.includes("ubuntu-latest"), false, "workflow must pin the runner image");
assert.ok(workflow.includes("ubuntu-24.04"), "workflow runner must be pinned to ubuntu-24.04");
const androidManifest = read("android/app/src/main/AndroidManifest.xml");
assert.ok(androidManifest.includes('android:icon="@mipmap/ic_launcher"'), "Android launcher icon missing");
for (const f of ["res/drawable/ic_launcher_foreground.xml", "res/drawable/ic_notification.xml", "res/mipmap-anydpi-v26/ic_launcher.xml", "res/mipmap-anydpi-v26/ic_launcher_round.xml"]) {
  assert.ok(read(`android/app/src/main/${f}`).length > 50, `Android resource missing: ${f}`);
}
assert.ok(read("android/app/src/main/java/com/doxajooon/lifecontrol/NotificationUtil.java").includes("R.drawable.ic_notification"), "notification icon not wired");
assert.ok(read("SUPABASE_SETUP.sql").includes("default 57"), "SQL schema_version default must be 57");
assert.equal(read("SUPABASE_SETUP.sql").includes("default 56"), false, "stale SQL schema_version default remains");
console.log("LIFE_CONTROL_V56_1_AUDIT_GUARDS_OK");

// $() is getElementById; selectors must go through $$(). Passing one returned null and crashed the Finance tab.
assert.equal(/(?<![\w$])\$\(\s*['"`]\[/.test(html), false, "$() called with a CSS selector; use $$()");
console.log("LIFE_CONTROL_V56_1_SELECTOR_GUARD_OK");

// ---- V57 redesign guards ----
for (const view of ["viewToday","viewGoal","viewGoalEdit","viewMoney","viewNotes","viewNoteEdit","viewSettings","viewDisplay","viewNotifications","viewProfile"]) {
  assert.ok(html.includes(`<section id="${view}" class="view`), `V57 screen missing: ${view}`);
}
for (const id of ["gateEyeBtn","gateRemember","pulseStatus","ringDay","ringGoal","ringFinance","ringDiscipline","ringDebt","tgCard","tmChart","taskList","addTaskBtn","goalList","addGoalBtn","geSave","geDelete","geMakeMain","moneyTabs","mvChart","qTransfer","txList","mcGrid","mcAdd","noteFilters","neBody","neSave","setDarkTheme","setFontScale","notifList","notifReadAll","pfDays","pfTasks","pfGoals","pfTx","pfExport","pfBackup","pfLogout","topChips","searchBtn"]) {
  assert.ok(html.includes(`id="${id}"`), `V57 element missing: ${id}`);
}
const bottomNav = html.slice(html.indexOf('<nav class="bottom"'), html.indexOf("</nav>", html.indexOf('<nav class="bottom"')));
assert.equal((bottomNav.match(/<button /g)||[]).length, 4, "bottom navigation must keep the four mockup items");
assert.equal(bottomNav.includes("viewProfile"), false, "profile must not be in the bottom navigation");
assert.ok(html.includes('id="setProfileRow"') && html.includes("showView('viewProfile')"), "profile must open from settings");
assert.ok(html.includes('data-tab="viewToday"') && html.includes('data-tab="viewMoney"'), "top chip tabs missing");
assert.ok(html.includes("life-control-v57") && html.includes("Life Control <span>V57</span>"), "V57 branding/channel missing");
assert.ok(html.includes("const DEFAULT_AUTH_EMAIL='doxajooon@gmail.com'"), "default login email missing");
// Login is Supabase email + password only: no Google / OAuth entry point.
const authBlock = html.slice(html.indexOf('<div class="auth-lock"'), html.indexOf('<header class="topbar">'));
assert.ok(authBlock.includes("gatePassword") && authBlock.includes("gateLoginBtn"), "auth block not found");
assert.equal(/google/i.test(authBlock), false, "Google sign-in must not exist on the login screen");
assert.equal(/signInWithOAuth|\/auth\/v1\/authorize|provider=google/i.test(html), false, "OAuth login must not exist");
assert.equal(html.includes("/^\\\\S+@"), false, "password reset email regex is double-escaped");
assert.ok(html.includes("backupPreV57(remote.state,'cloud')") && html.includes("backupPreV57(s,'local')"), "pre-V57 backups missing");
assert.ok(html.includes("migrateV57(s,fromVersion)"), "V57 migration is not wired into normalize");

// Run the real migration code against a V56 state.
const migSrc = html.slice(html.indexOf("/* V57: goals[] / tasks[]"), html.indexOf("function normalize(s){"));
const helpers = "function uid(){return 'id-'+Math.random().toString(36).slice(2)}function keyDay(d=new Date()){return d.toISOString().slice(0,10)}const localStorage={getItem(){return null},setItem(){}};function openLifeDB(){return Promise.resolve(null)}";
const mig = new Function(helpers + migSrc + "return {migrateV57,syncMainGoalMirror,GOAL_COLORS,NOTE_CATS};")();
const v56 = {version:56,profile:{name:"",currency:"сомони"},settings:{theme:"dark"},notificationsLog:[{title:"Пора: Работа",body:"",at:"2026-09-01T08:30:00Z"}],
  reports:{"2026-05-02":{steps:{}}},profits:[{amount:100,at:"2026-06-01T10:00:00Z"}],expenses:[],notes:[],
  goal:{title:"Купить квартиру",why:"Своё жильё",next:"",milestones:[],finance:{targetAmount:150000,savedAmount:20000,manualSavedAmount:15000,targetDate:"2027-06-01",startedAt:"2026-03-01T00:00:00Z",contributions:[{id:"c1",amount:5000,at:"2026-04-01T00:00:00Z"}]}}};
const before = JSON.stringify(v56.goal);
mig.migrateV57(v56, 56);
assert.equal(v56.goals.length, 1, "migration must create exactly one goal from state.goal");
assert.equal(v56.goals[0].main, true, "migrated goal must be the main goal");
assert.equal(v56.goals[0].title, "Купить квартиру", "migrated goal must keep the title");
assert.equal(v56.goals[0].targetAmount, 150000, "migrated goal must mirror the target amount");
assert.equal(v56.goals[0].contributions.length, 0, "main goal money must stay only in state.goal.finance");
assert.equal(JSON.stringify(v56.goal), before, "migration must not change state.goal");
assert.ok(Array.isArray(v56.tasks) && v56.profile.createdAt.startsWith("2026-03-01"), "tasks/profile.createdAt migration failed");
mig.migrateV57(v56, 57);
assert.equal(v56.goals.length, 1, "repeated migration must not duplicate goals");
v56.goal.title = "Новая формулировка"; mig.syncMainGoalMirror(v56);
assert.equal(v56.goals[0].title, "Новая формулировка", "main goal changes must sync from state.goal");
assert.ok(html.includes("function makeGoalMain(") && html.includes("syncMainGoalMirror();saveState()"), "main goal switch must sync state.goal");
assert.ok(html.includes("category:NOTE_CATS[n.category]?n.category:'personal'"), "notes without category must default to «Личные»");
console.log("LIFE_CONTROL_V57_REDESIGN_OK");
