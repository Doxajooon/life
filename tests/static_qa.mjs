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
assert.equal(pkg.version, "68.0.0");
assert.match(gradle, /versionCode 680\b/); assert.match(gradle, /versionName '68\.0'/);
assert.match(csproj, /<Version>68\.0\.0<\/Version>/);
assert.ok(html.includes("s.version=58") && html.includes('brand-ver">V68'), "app version must be V68 (state schema 58)");
assert.ok(sw.includes("jamal-life-v68-0"), "service worker cache must be V68");

// branding
assert.equal(manifest.name, "Jamal Life");
assert.ok(!/Life Control/.test(html), "old name left in the app");
for (const f of ["icon.svg", "icon-192.png", "icon-512.png", "desktop/app.ico", "android/app/src/main/res/raw/jamal_glow.wav"]) assert.ok(existsSync(new URL(f, root)), "missing " + f);
assert.ok(read("android/app/src/main/res/values/strings.xml").includes("Jamal Life"));

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
assert.ok(notif.includes("R.raw.jamal_glow") && notif.includes("IMPORTANCE_HIGH"), "Android chime channel");
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
assert.ok(existsSync(new URL("../sounds/jamal-glass.wav", import.meta.url)) && html.includes("sounds/jamal-glass.wav") && sw.includes("jamal-glass.wav") && notif.includes('"jamal_life_glass"'), "the Jamal Glass tone ships to web and Android (new channel so phones pick it up)");
for (const f of ["manrope", "nunito", "inter"]) assert.ok(existsSync(new URL(`../fonts/${f}-cyrillic.woff2`, import.meta.url)) && sw.includes(`${f}-cyrillic.woff2`), "font missing: " + f);
assert.ok(html.includes('id="setFont"') && html.includes("function applyFont"), "font choice in settings");
assert.ok(html.includes("rememberBaseStamp(state[CLOUD_BASE_KEY])") && html.includes("const st=baseStamp()"), "the cloud base stamp survives a quick restart (an edit made during the first upload is merged, not lost)");
assert.ok(html.includes("function openDebtHistory") && html.includes("function liveMoneyForm") && html.includes("function autoMilestones") && html.includes("function maybeAutoGoalAI") && html.includes("function aiTextHtml"), "V68 features");
assert.ok(fn.includes("function lifeContext") && fn.includes("ПЛЮСЫ") && fn.includes("КУДА Я ИДУ"), "life analysis: pluses, minuses and direction");
console.log("JAMAL_LIFE_V68_STATIC_QA_OK");
