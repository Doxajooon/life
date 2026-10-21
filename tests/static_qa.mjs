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
assert.equal(pkg.version, "74.2.0");
assert.match(gradle, /versionCode 742\b/); assert.match(gradle, /versionName '74\.2'/);
assert.match(csproj, /<Version>74\.2\.0<\/Version>/);
// 73: one APP_VERSION, shown only in «Настройки → О приложении» (not on the home or login screen); state schema stays 58
assert.ok(html.includes("s.version=58") && (html.match(/\bAPP_VERSION=/g) || []).length === 1 && html.includes("APP_VERSION='74.2'") && html.includes('id="appVersion">74.2</span>'), "app version 74.1 from one constant (state schema 58)");
assert.ok(!html.includes("brand-ver") && !/auth-title[^>]*>[^<]*<span>V\d/.test(html) && !/>V\d\d</.test(html), "no version on the home screen or the login screen");
assert.ok(sw.includes("'life-v74-2'"), "service worker cache must be life-v74-2");
assert.ok(sw.includes("./images/bg-kaaba.jpg") && read("tools/sync-platforms.mjs").includes("images/bg-kaaba.jpg"), "the background photo works offline and on Android/Windows");

// branding
assert.equal(manifest.name, "Life"); assert.equal(manifest.short_name, "Life");
assert.ok(!/Life Control/.test(html), "old name left in the app");
for (const f of ["icon.svg", "icon-192.png", "icon-512.png", "desktop/app.ico", "android/app/src/main/res/raw/jamal_dawn.wav"]) assert.ok(existsSync(new URL(f, root)), "missing " + f);
assert.ok(read("android/app/src/main/res/values/strings.xml").includes('<string name="app_name">Life</string>') && csproj.includes("<Product>Life</Product>") && csproj.includes("<AssemblyName>Life</AssemblyName>"), "the name «Life» on Android and Windows (Life.exe)");
assert.ok((html.match(/\bAPP_NAME=/g) || []).length === 1 && html.includes("const APP_NAME='Life'"), "the visible name comes from one APP_NAME constant");
assert.ok(read("android/app/build.gradle").includes("com.doxajooon.lifecontrol") && html.includes("const KEY='LIFE_CONTROL_V52'") && html.includes("LifeControlDB") && notif.includes('"jamal_life_dawn2"'), "internal ids stay (package, storage keys, IndexedDB; notification channel jamal_life_dawn2 since 74.1) — the APK installs over 71/72 and nothing is lost");

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
assert.ok(existsSync(new URL("../sounds/jamal-dawn.wav", import.meta.url)) && html.includes("sounds/jamal-dawn.wav") && sw.includes("jamal-dawn.wav") && notif.includes('"jamal_life_dawn2"'), "the Jamal Glass tone ships to web and Android (new channel so phones pick it up)");
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

// 74.1: the green live sprout in the ring everywhere, glass cards, louder reminders
{ const svg = read("icon.svg");
  for (const k of ['id="spbg"', 'id="spring"', 'id="spleafL"', 'id="spleafR"', 'id="spstem"', 'id="spdrop"', "M256 88 A168 168 0 1 1 101 191", "M262 240 C262 182 300 142 366 138", "#15324f", "#e3b04b"]) assert.ok(svg.includes(k), "icon.svg is the green sprout in the ring: " + k);
  assert.ok(!/lfleaf|lfgold|M120 396 C108 236/.test(svg + html), "the leaf-and-coin mark is gone");
  const png = f => { const b = readFileSync(new URL(f, root)); assert.equal(b.toString("hex", 0, 8), "89504e470d0a1a0a", f + " is a PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(png("icon-192.png"), [192, 192]); assert.deepEqual(png("icon-512.png"), [512, 512]); assert.deepEqual(png("icon-maskable.png"), [512, 512]);
  for (const f of ["icon-192.png", "icon-512.png"]) { const b = readFileSync(new URL(f, root)); assert.ok(b.length > 20000, f + " was regenerated from the new icon (tools/make-icons.mjs)"); }
  const ico = readFileSync(new URL("desktop/app.ico", root)); assert.equal(ico.readUInt16LE(2), 1); const n = ico.readUInt16LE(4);
  const icoSizes = [...Array(n)].map((_, i) => ico.readUInt8(6 + 16 * i) || 256).sort((a, b) => a - b); assert.deepEqual(icoSizes, [16, 32, 48, 256], "app.ico has 16, 32, 48 and 256 px");
  assert.ok(manifest.icons.some(i => i.src === "icon-maskable.png" && i.purpose === "maskable") && sw.includes("./icon-maskable.png") && read("tools/sync-platforms.mjs").includes("icon-maskable.png"), "the maskable icon ships to web, Android and Windows");
  const fg = read("android/app/src/main/res/drawable/ic_launcher_foreground.xml");
  assert.ok(fg.includes("M256,88 A168,168 0 1,1 101,191") && fg.includes("M262,240 C262,182 300,142 366,138") && fg.includes('android:scaleX="0.175"') && fg.includes('android:translateX="9.2"') && fg.includes("#FFE3B04B") && fg.includes("#FF22C55E"), "Android launcher: the sprout and the ring inside the 66dp safe zone");
  assert.ok((168 + 11) * 0.175 <= 33 && Math.abs(256 * 0.175 + 9.2 - 54) < 0.01, "the ring fits the 66dp safe circle and is centred");
  assert.ok(read("android/app/src/main/res/values/colors.xml").includes('<color name="ic_launcher_background">#0F2236</color>'), "Android launcher background #0F2236");
  const ni = read("android/app/src/main/res/drawable/ic_notification.xml");
  assert.ok(/sprout/.test(ni) && !/crown|leaf whose|coin/i.test(ni) && ni.includes("M262,240 C262,182 300,142 366,138") && !/(fill|stroke)Color="#(?!FFFFFFFF|00000000)/.test(ni), "notification icon: a white sprout silhouette");
  assert.ok(read("android/app/src/main/res/layout/widget_jamal.xml").includes("@drawable/ic_widget_sprout") && !existsSync(new URL("android/app/src/main/res/drawable/ic_widget_leaf.xml", root)) && !existsSync(new URL("android/app/src/main/res/drawable/ic_widget_crown.xml", root)), "the widget shows the sprout");
  assert.equal(manifest.background_color, "#0f2236", "PWA splash background matches the icon");
  assert.ok(html.includes('<g class="jl-sprout">') && html.includes('id="jlRing"') && html.includes('stop-color="#e3b04b"') && html.includes(".jl-logo{background:linear-gradient(145deg,#15324f,#07111d)"), "the logo next to «Life» is the same green sprout, ring turquoise → gold");
  assert.ok(html.includes(".jl-logo .jl-sprout{transform-origin:258px 356px;animation:jlSway") && html.includes(".jl-logo .jl-sprout,.jl-logo .jl-dew,"), "the logo is alive and calms down with reduced motion");
  // glass
  assert.ok(html.includes('html[data-theme="dark"] .card{background:color-mix(in srgb,var(--panel) 62%,transparent)}') && html.includes(".card,.jl-hero{-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}") && html.includes("rgba(36,76,134,.66)"), "dark cards 62 %, blur 12px, «Сейчас» .66");
  assert.ok(html.includes("html[data-theme=\"dark\"] .jl-goalhero{background:linear-gradient(160deg,rgba(20,48,78,.66)") && html.includes(".jl-now,.jl-quote{background:rgba(15,37,70,.85)}") && html.includes(".jl-sky::after{content:\"\""), "goal cards are glass, inner blocks stay dense, the shade on the photo stays");
  // louder reminders
  const wav = readFileSync(new URL("sounds/jamal-dawn.wav", root)), raw = readFileSync(new URL("android/app/src/main/res/raw/jamal_dawn.wav", root));
  assert.ok(wav.equals(raw), "web and Android play the same wav");
  const fmt = wav.indexOf("fmt "), data = wav.indexOf("data"), rate = wav.readUInt32LE(fmt + 12), ch = wav.readUInt16LE(fmt + 10), bits = wav.readUInt16LE(fmt + 22), len = wav.readUInt32LE(data + 4);
  assert.equal(bits, 16); let peak = 0; for (let i = data + 8; i < data + 8 + len; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  const secs = len / (rate * ch * 2);
  let sq = 0; for (let i = data + 8; i < data + 8 + len; i += 2) sq += (wav.readInt16LE(i) / 32768) ** 2;
  const rmsDb = 10 * Math.log10(sq / (len / 2));
  assert.ok(rmsDb >= -10, `the reminder sound is loud on average (${rmsDb.toFixed(1)} dBFS ≥ −10; 74.0 had −18.7)`);
  assert.ok(peak / 32768 >= 0.9 && secs >= 3, `the reminder sound is louder and longer (peak ${(peak / 32768).toFixed(2)} ≥ 0.9, ${secs.toFixed(2)} s ≥ 3 s)`);
  assert.ok(notif.includes('CHANNEL = "jamal_life_dawn2"') && notif.includes("AudioAttributes.USAGE_ALARM") && notif.includes("AudioAttributes.USAGE_NOTIFICATION_EVENT") && notif.includes('CHANNEL_SOFT = "jamal_life_dawn2_soft"'), "loud channel on the alarm stream, quiet channel on the notification stream");
  assert.ok(/OLD_CHANNELS = \{"jamal_life_dawn",/.test(notif), "the 74.0 channel jamal_life_dawn is deleted (new sound = new channel)");
  assert.ok(notif.includes("enableVibration(true)") && notif.includes('getBoolean("loud", true)') && notif.includes("setOnlyAlertOnce(false)"), "reminders vibrate, loud is the default, a snoozed reminder rings again");
  assert.ok(activity.includes("public void setLoudReminders(boolean on)") && html.includes("window.AndroidBridge?.setLoudReminders?.(state.settings?.loudReminders!==false)") && html.includes("if(typeof s.settings.loudReminders!=='boolean')s.settings.loudReminders=true;"), "the switch «Громкие напоминания» reaches Android and is on by default");
  assert.ok(html.includes("g.gain.value=1;") && desktop.includes("new SoundPlayer(wav)") && desktop.includes('window.__jlHostSound=1'), "web plays at full gain; Windows plays the sound itself, also from the tray"); }
// 74.1: one sync at a time — cloudSync() runs only inside cloudAutoSync (its in-flight guard); a direct call raced the background sync
{ const direct = [...html.matchAll(/(?<!function )(?<![.\w])cloudSync\(\)/g)].length;
  assert.equal(direct, 1, "cloudSync() is called only from cloudAutoSync (found " + direct + " calls)");
  assert.ok(html.includes("const dirtyNow=dirty||isCloudDirty();") && html.includes("if(!dirtyNow){const changed=applyCloudState(row.state,row.updated_at);"), "an edit made during the download is merged, not overwritten");
  assert.ok(html.includes("(_cloudBaseFingerprint?fingerprint!==_cloudBaseFingerprint:appReadyForSync)"), "an edit right after a restart (before the first sync) is marked unsent"); }
// 74.2: AI failures are explained and logged; the checklist of the owner
{ const ts = read("supabase/functions/life-control-ai/index.ts");
  assert.ok(ts.includes('console.error("ai fail", JSON.stringify(info))') && (ts.match(/return fail\(/g) || []).length >= 7 && !/return json\(\{ error: /.test(ts), "every error answer of the Edge Function goes through fail() and leaves its reason in the logs");
  assert.ok(ts.includes('replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza***")') && !/console\.(log|error)\([^)]*(key|token|email|JSON\.stringify\(ctx|input)\b/i.test(ts.replace(/safe\([^)]*\)/g, "")), "the logs never get the key, the token, the e-mail or the user's data");
  assert.ok(html.includes("function normalizeAIError(data,status){") && html.includes("const AI_FALLBACK=") && html.includes("Google прислал пустой ответ"), "the app explains every AI failure in Russian");
  for (const f of ["function daySteps(", "function dayOff(", "function openWeekSchedule(", "function prayerTimes(", "function renderPrayer(", "function openIncomeSplit(", "function renderFreedomPath(", "function checkFreedomPath(", "function quickCloseDay(", "function debtNamed("]) assert.ok(html.includes(f), "74.2 needs " + f);
  assert.ok(!/state\.day\.steps\[i\]|for\(const s of state\.day\.steps\)\{\s*window/.test(html.slice(html.indexOf("function runScheduler"), html.indexOf("function runScheduler") + 4000)), "the scheduler reads daySteps() (the weekday schedule)");
  assert.ok(activity.includes("public void scheduleDailyDays(String id, String time, String days") && activity.includes("bridgeVersion() { return 7; }") && read("android/app/src/main/java/com/doxajooon/lifecontrol/AlarmReceiver.java").includes("AlarmScheduler.ringsToday(days)"), "Android rings weekday alarms only on their days");
  assert.ok(html.includes("const FREEDOM_STOPS=[25,50,75,100];") && html.indexOf("const FREEDOM_STOPS") < html.indexOf("let state=load()"), "FREEDOM_STOPS is defined before the first normalize()");
  assert.ok(html.includes("if(!Array.isArray(s.debts.freedomWon))") && html.includes("if('week' in s.day)"), "74.2 data is migrated in normalize()");
  assert.ok(html.includes("<span data-free-left></span>"), "«Твой вечер» updates only its countdown every minute (a tap is never lost)"); }
console.log("LIFE_V73_STATIC_QA_OK");
