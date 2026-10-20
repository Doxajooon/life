// Fast structural checks (no browser): run on every push before the builds.
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");
const sw = read("sw.js");
const fn = read("supabase/functions/life-control-ai/index.ts");
const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read("manifest.webmanifest"));
const gradle = read("android/app/build.gradle");
const activity = read("android/app/src/main/java/com/doxajooon/lifecontrol/MainActivity.java");
const notif = read("android/app/src/main/java/com/doxajooon/lifecontrol/NotificationUtil.java");
const desktop = read("desktop/MainWindow.xaml.cs");
const csproj = read("desktop/JamalLife.Desktop.csproj");

// one version everywhere
assert.equal(pkg.version, "74.0.0");
assert.match(gradle, /versionCode 740\b/); assert.match(gradle, /versionName '74\.0'/);
assert.match(csproj, /<Version>74\.0\.0<\/Version>/);
// 73: one APP_VERSION, shown only in «Настройки → О приложении» (not on the home or login screen); state schema stays 58
assert.ok(html.includes("s.version=58") && (html.match(/\bAPP_VERSION=/g) || []).length === 1 && html.includes("APP_VERSION='74.0'") && html.includes('id="appVersion">74.0</span>'), "app version 74.0 from one constant (state schema 58)");
assert.ok(!html.includes("brand-ver") && !/auth-title[^>]*>[^<]*<span>V\d/.test(html) && !/>V\d\d</.test(html), "no version on the home screen or the login screen");
assert.ok(sw.includes("'life-v73-0'"), "service worker cache must be life-v73-0");

// branding
assert.equal(manifest.name, "Life"); assert.equal(manifest.short_name, "Life");
assert.ok(!/Life Control/.test(html), "old name left in the app");
for (const f of ["icon.svg", "icon-192.png", "icon-512.png", "desktop/app.ico", "android/app/src/main/res/raw/jamal_dawn.wav"]) assert.ok(existsSync(new URL(f, root)), "missing " + f);
assert.ok(read("android/app/src/main/res/values/strings.xml").includes('<string name="app_name">Life</string>') && csproj.includes("<Product>Life</Product>") && csproj.includes("<AssemblyName>Life</AssemblyName>"), "the name «Life» on Android and Windows (Life.exe)");
assert.ok((html.match(/\bAPP_NAME=/g) || []).length === 1 && html.includes("const APP_NAME='Life'"), "the visible name comes from one APP_NAME constant");
assert.ok(read("android/app/build.gradle").includes("com.doxajooon.lifecontrol") && html.includes("const KEY='LIFE_CONTROL_V52'") && html.includes("LifeControlDB") && notif.includes('"jamal_life_dawn"'), "internal ids stay (package, storage keys, IndexedDB, notification channel) — the APK installs over 71/72 and nothing is lost");

// single source of truth: no checked-in copies of the web app
let tracked = [];
try { tracked = execSync("git ls-files", { cwd: new URL(".", root) }).toString().split("\n"); } catch { /* not a git checkout */ }
for (const f of ["public/index.html", "desktop-native/main.go", "android/app/src/main/assets/index.html", "desktop/Web/index.html"]) assert.ok(!tracked.includes(f), "duplicate copy committed: " + f);

// app script parses, exactly one inline script, one style block
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, "exactly one inline script");
assert.doesNotThrow(() => new Function(scripts[0][1]), "main script has syntax errors");
assert.equal((html.match(/<style\b/g) || []).length, 1, "CSS must live in one <style> block");
const js = scripts[0][1];
const defs = [...js.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]);
const dup = defs.filter((n, i) => defs.indexOf(n) !== i);
assert.deepEqual(dup, [], "functions defined twice: " + dup.join(", "));

// sync: no cache for other origins, token refresh, conditional writes, merge
assert.ok(/url\.origin !== self\.location\.origin\) return/.test(sw), "SW must ignore cross-origin requests");
for (const name of ["supaFetch", "cloudRefresh", "cloudSync", "cloudPushNow", "mergeStates", "mergeFirstContact", "sessionExpired", "setSyncStatus"]) assert.ok(defs.includes(name), "missing " + name);
assert.ok(js.includes("&updated_at=eq.") && js.includes("method:'PATCH'"), "pushes must be conditional on the row version");
assert.ok(js.includes("cache:'no-store'"), "Supabase requests must bypass HTTP caches");

// reminders
for (const name of ["playNotificationSound", "notify", "runScheduler", "scheduleNativeTasks", "taskLead", "showWebNotification"]) assert.ok(defs.includes(name), "missing " + name);
assert.ok(js.includes("window.__jlTick="), "desktop host tick missing");
assert.ok(js.includes("REMINDER_GRACE_MIN"), "missed reminders must catch up");
assert.ok(activity.includes("scheduleOnce") && activity.includes("ACTION_VIEW"), "Android task alarms / external links");
assert.ok(!/return false;\s*\n\s*\n\s*try \{\s*\n\s*startActivity/.test(activity) && !activity.includes('"http".equalsIgnoreCase(scheme)) return false'), "external sites must not open inside the WebView");
assert.ok(notif.includes("R.raw.jamal_dawn") && notif.includes("IMPORTANCE_HIGH"), "Android chime channel");
assert.ok(desktop.includes("NotifyIcon") && desktop.includes("__jlTick") && desktop.includes("WebMessageReceived"), "Windows tray + notifications");

// secrets never ship to the browser
for (const bad of ["SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "sb_secret_"]) assert.ok(!html.includes(bad), "secret reference in app: " + bad);
assert.ok(fn.includes('Deno.env.get("GEMINI_API_KEY")') && fn.includes("auth.getUser"), "AI function auth/secret");
assert.ok(fn.includes("ai_usage"), "AI function rate limit");
assert.ok(read("supabase/config.toml").includes("verify_jwt = true"));

// readability: nothing smaller than 11px, and the day never starts with a red «Критично»
const tiny = [...html.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)\b/g)].map(m => (m[2] === "rem" ? +m[1] * 16 : +m[1])).filter(v => v >= 5 && v < 11);
assert.deepEqual(tiny, [], "text smaller than 11px: " + tiny.join(", "));
assert.ok(!html.includes("'Критично'"), "ring labels must not scold");

// Gemini: models are tried one after another on quota (429) or unknown model; errors reach the user in Russian
{ assert.ok(/:generateContent/.test(fn) && /async function candidates/.test(fn) && /continue; \/\/ 429 quota/.test(fn) && /function ruError/.test(fn), "AI must fall back to another model when one model's quota is exhausted");
  for (const m of ["week", "deep", "goal"]) assert.ok(fn.includes(`body?.mode === "${m}"`), "AI mode missing: " + m); }
assert.ok(html.includes("function resetForNewOwner") && html.includes("OWNER_KEY") && /owner&&owner!==user\.id\)resetForNewOwner\(\)/.test(html), "another account must never get the previous owner's records");
assert.ok(html.includes("if(synced)await wipeLocalData()"), "logout must clear personal data from the device once it is safe in the cloud");
assert.ok(html.includes("function renderRhythm") && html.includes("function renderDayStrip") && html.includes("function renderHabitWeek"), "living rhythm, day strip and habit week chart");
assert.ok(existsSync(new URL("../fonts/inter-cyrillic.woff2", import.meta.url)) && html.includes('url("fonts/inter-cyrillic.woff2")') && sw.includes("inter-cyrillic.woff2"), "Inter font must ship with the app (offline)");
assert.ok(!html.includes("data-more=") && !html.includes('class="jl-more"'), "Money and Goal show everything — no hidden «Подробнее» blocks");
assert.ok(existsSync(new URL("../sounds/jamal-dawn.wav", import.meta.url)) && html.includes("sounds/jamal-dawn.wav") && sw.includes("jamal-dawn.wav") && notif.includes('"jamal_life_dawn"'), "the Jamal Glass tone ships to web and Android (new channel so phones pick it up)");
for (const f of ["manrope", "nunito", "inter"]) assert.ok(existsSync(new URL(`../fonts/${f}-cyrillic.woff2`, import.meta.url)) && sw.includes(`${f}-cyrillic.woff2`), "font missing: " + f);
assert.ok(html.includes('id="setFont"') && html.includes("function applyFont"), "font choice in settings");
assert.ok(html.includes("rememberBaseStamp(state[CLOUD_BASE_KEY])") && html.includes("const st=baseStamp()"), "the cloud base stamp survives a quick restart (an edit made during the first upload is merged, not lost)");
assert.ok(html.includes("function openDebtHistory") && html.includes("function liveMoneyForm") && html.includes("function autoMilestones") && html.includes("function maybeAutoGoalAI") && html.includes("function aiTextHtml"), "V68 features");
assert.ok(fn.includes("function lifeContext") && fn.includes("ПЛЮСЫ") && fn.includes("КУДА Я ИДУ"), "life analysis: pluses, minuses and direction");
// V69: keyboard for the debt chart and the quote; AI answer parser tolerant of markdown; debt payments outside «Расход»; per-stage auto-close
assert.ok(/<figure class="jl-quote" role="button" tabindex="0" aria-expanded="false"/.test(html) && html.includes("function toggleQuote") && /keydown[\s\S]{0,200}#debtChart \[data-debt-open\]/.test(html), "debt bars and the quote open from the keyboard");
assert.ok(!/id="debtChart" role="img"/.test(html), "interactive bars must not sit inside role=img");
assert.ok(/const md=\/\^#\{1,6\}/.test(html) && html.includes("bold=/^"), "AI parser must understand markdown and bold headings");
assert.ok(html.includes("const spendOnly=") && html.includes("monthSum(spendOnly(state.expenses))") && ["tmDebtPay", "mvDebtPay", "mcDebtPay"].every(id => html.includes(`id="${id}"`)), "debt payments are shown apart from «Расход»");
assert.ok(html.includes("(debt?debtPaysOnly:spendOnly)(state.expenses)") && html.includes("net:income-expense-debt") && html.includes("const out=spendOnly(state.expenses).filter(x=>inRange(x)") && html.includes("monthSum(spendOnly(state.expenses)));setText('dpLeft'") && ["calDayDebtPay", "calRangeDebtPay", "wkDebtPay"].every(id => html.includes(id)), "day, period, week and the debt-plan hint keep debt payments out of «Расход»");
assert.ok(fn.includes("debtPaid: dp.reduce") && fn.includes("debtPaid:dp30") && fn.includes("!x?.debtPayment"), "AI context: debt payments are not spending");
assert.ok(html.includes("if(m.done||m.autoOff)return") && html.includes("data-ms-auto") && html.includes("if(m.autoOff!==true)delete m.autoOff"), "auto-closing goal stages can be switched off");
// no CSS for classes the app never uses
{ const css = html.slice(html.indexOf("<style"), html.indexOf("</style>")), rest = html.replace(css, "");
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classes = [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, "{}").matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]))].filter(c => !/^\d/.test(c));
  const unused = classes.filter(c => !new RegExp("(?<![\\w-])" + esc(c) + "(?![\\w-])").test(rest) && !new RegExp(esc(c.replace(/-[^-]+$/, "-")) + "(?:'|\"|`|\\$\\{)").test(rest));
  assert.deepEqual(unused, [], "CSS for classes nobody uses: " + unused.join(", ")); }
// user text that ends up inside HTML without esc(): the currency and the bank sticker are cleaned at the source
assert.ok(html.includes("function currencyLabel()") && !html.includes("state.profile.currency||'сомони'") && html.includes("function cleanEmoji(") && html.includes('<span class="ico">${esc(x.icon)}</span>'), "currency and bank stickers must never carry markup");
// V70: clean code — no function nobody calls, no debug logging; the lock file carries the same version
{ const lock = JSON.parse(read("package-lock.json")); assert.equal(lock.version, pkg.version, "package-lock.json version");
  const unused = defs.filter(n => (html.match(new RegExp("(?<![\\w$])" + n.replace(/\$/g, "\\$") + "(?![\\w$])", "g")) || []).length < 2);
  assert.deepEqual(unused, [], "functions nobody calls: " + unused.join(", "));
  assert.ok(!/console\.(log|debug|info)\(/.test(js), "no debug console output in the app"); }
assert.ok(html.includes("function linkLabels(") && !/user-scalable=no|maximum-scale=1/.test(html), "labels linked to fields; zoom allowed (axe)");
assert.ok(html.includes("function cleanRecords(") && html.includes("function stableId(") && html.includes("if(!s||typeof s!=='object'||Array.isArray(s))s={};"), "normalize survives broken data and gives old records the same id on every device");
assert.ok(html.includes("let modalHistory=false") && html.includes("const TAP_SLOP=16"), "«back» closes a window; a tap with finger drift opens a transaction");
// V71: «назад» keeps each screen's place; a living sky that pauses in the background; the overall pulse gauge; the nature sound;
// burning habits with the «отказ» kind; the day report; wins with thanks; 2-hour reminders built around the goal
assert.ok(html.includes("var viewScroll={}") && html.includes("viewScroll[prev]=window.scrollY"), "every screen remembers its scroll place");
assert.ok(html.includes('class="jl-sky"') && html.includes("body.jl-hidden .jl-sky *{animation-play-state:paused}"), "the sky pauses when the app is hidden");
assert.ok(html.includes("function renderPulseGauge(") && html.includes('id="pgArc"'), "the overall pulse gauge");
assert.ok(existsSync(new URL("../tools/make-dawn.py", import.meta.url)) && !existsSync(new URL("../sounds/jamal-glass.wav", import.meta.url)), "Jamal Dawn is made by tools/make-dawn.py; the old tone is gone");
assert.ok(notif.includes('"jamal_life_glass"') && notif.indexOf('"jamal_life_glass"') > notif.indexOf("OLD_CHANNELS"), "the old sound channel is deleted on Android (a channel's sound cannot change)");
assert.ok(html.includes("avoid:h.avoid===true") && html.includes("function renderDayLedger(") && html.includes("function earnedAchievements(") && html.includes("function goalFocusLine("), "habits «отказ», day report, earned wins, goal-linked reminders");
// V72: the rhythm leads (one goal-linked action per stage, start/end reminders with «Да / Перенести»), goal tasks, the goal's road map,
// nothing cut off, redraw only what changed, animations on transform/opacity only, one icon style, daily cloud copies, AI within ~19 s
assert.ok(html.includes("function stageFocus(") && html.includes("function stageReminderTexts(") && html.includes("'stend_'+s.id") && html.includes("stage:'+s.id"), "stage focus and start/end-of-stage reminders");
{ const ar = read("android/app/src/main/java/com/doxajooon/lifecontrol/AlarmReceiver.java"), act = read("android/app/src/main/java/com/doxajooon/lifecontrol/ActionReceiver.java");
  assert.ok(ar.includes('"stend_"') && notif.includes('"Перенести"') && act.includes('task.startsWith("stage:")'), "Android: «Да / Перенести» on the stage reminder"); }
assert.ok(html.includes("function nextTwoHour(") && html.includes("data-free-goal") && html.includes("dd.goalDone"), "free time starts with the goal step and the real next reminder");
assert.ok(html.includes("function taskNotice(") && html.includes("goal:'main',ms:") && html.includes("tk=(state.tasks||[]).filter(x=>x.goal&&x.ms===m.id)"), "goal tasks count into the goal stage");
assert.ok(html.includes("function renderMilestones(") && html.includes("function milestoneCloseHint(") && html.includes("Откроется после этапа"), "goal stages as a road map");
assert.ok(html.includes("function painter(") && html.includes("function textOf("), "redraw only what changed");
{ const css = html.slice(0, html.indexOf("</style>")), bad = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) if ([...m[2].matchAll(/([a-z-]+)\s*:/g)].some(x => !["transform", "opacity"].includes(x[1]))) bad.push(m[1]);
  assert.deepEqual(bad, [], "animations must move only transform/opacity: " + bad.join(", ")); }
assert.ok(html.includes("@keyframes jlIconIn") && html.includes("#txFilters{flex-wrap:wrap"), "one icon style; transaction filters wrap");
assert.ok(html.includes("life_state_history") && html.includes("CLOUD_KEEP_DAYS=30") && read("supabase/setup.sql").includes("create table if not exists public.life_state_history") && /life_state_history_select_own[\s\S]*auth\.uid\(\)/.test(read("supabase/setup.sql")), "daily cloud copies with RLS");
assert.ok(fn.includes("DEADLINE_MS") && fn.includes("busyUntil") && fn.includes("перегружен") && html.includes("Google перегружен, пробую другую модель") && html.includes("function v72Facts("), "AI answers within ~19 s and sees the day report, «отказ» habits, wins and the goal stage");
// 73: an app for everybody — nothing personal of the owner in the code, a clean start for a new person
{ const files = execSync("git ls-files", { cwd: new URL(".", root) }).toString().split("\n").filter(f => f && !/\.(png|ico|wav|woff2|jar|keystore)$/.test(f));
  const withMail = files.filter(f => { try { return read(f).includes("doxajooon" + "@gmail.com"); } catch { return false; } });
  assert.deepEqual(withMail, [], "the owner's e-mail is in: " + withMail.join(", "));
  const visible = ["index.html", "manifest.webmanifest", "sw.js", "supabase/functions/life-control-ai/index.ts", "android/app/src/main/res/values/strings.xml", "android/app/src/main/res/layout/widget_jamal.xml", "desktop/MainWindow.xaml", "desktop/MainWindow.xaml.cs", ".github/workflows/release.yml",
    ...files.filter(f => /^android\/app\/src\/main\/java\/.*\.java$/.test(f))];
  const named = visible.filter(f => read(f).includes("Jamal " + "Life"));
  assert.deepEqual(named, [], "«Jamal Life» is still shown in: " + named.join(", "));
  assert.ok(!html.includes("DEFAULT_AUTH_EMAIL") && /<input id="gateEmail"(?![^>]*value=)[^>]*>/.test(html) && html.includes("localStorage.getItem(AUTH_EMAIL_KEY)||''"), "the login e-mail is empty (only this device's last e-mail is filled in)");
  const def = html.slice(html.indexOf("const DEFAULT={"), html.indexOf("\n};", html.indexOf("const DEFAULT={")));
  for (const bad of ["100000", "120000", "5200", "4500", "финансово независим", "комнат", "семь", "раскро", "Английский"]) assert.ok(!def.includes(bad) && !(bad.length > 6 && html.includes(bad)), "personal default value left: " + bad);
  assert.ok(/income:0,/.test(def) && /debts:\{bank:0,firms:0,monthlyPayment:0\}/.test(def) && /goal:\{title:'',why:'',next:''/.test(def) && /milestones:\[\]\}/.test(def), "neutral defaults: no income, no debts, an empty goal");
  for (const f of ["hasUserData", "clearLegacyDemo", "applyV73", "debtLabel", "goalName", "quoteSet", "openOnboarding", "needsOnboarding", "profitSources"]) assert.ok(defs.includes(f), "73: missing " + f);
  assert.ok(html.includes("s.settings.quoteSet='hadith'") && html.includes("old?'Банк':'Долг 1'") && html.includes("s.settings.onboarded=old"), "a user with data keeps the hadiths, «Банк / Фирмы» and never sees the first-start setup");
  assert.ok(/const GENERAL_QUOTES=\[([\s\S]*?)\];/.test(html) && html.match(/const GENERAL_QUOTES=\[([\s\S]*?)\];/)[1].split("\n").filter(l => l.trim().startsWith("'")).length === 60, "60 neutral thoughts of the day");
  assert.ok(!/Аллах|Пророк|намаз|ﷺ/.test(html.match(/const GENERAL_QUOTES=\[([\s\S]*?)\];/)[1]), "the neutral quotes carry no religious text");
  assert.ok(html.includes("const o=clone(b);for(const k of Object.keys(a||{}))o[k]=merge(a[k],b[k])"), "merge() copies the defaults — an edit can never change DEFAULT itself");
  assert.ok(fn.includes('const APP_NAME = "Life"') && !fn.includes("Душанбе"), "AI: neutral name");
  assert.ok(html.includes("FIRST_PUSH_KEY='JL_FIRST_PUSH_V73'") && html.includes("row.device_id===getDeviceId()") && html.includes("const merged=own?mergeStates(remote,state,remote):mergeFirstContact(state,remote)"), "an edit made during the very first upload survives a restart"); }
console.log("LIFE_V73_STATIC_QA_OK");
