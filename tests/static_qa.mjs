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
assert.equal(pkg.version, "58.3.0");
assert.match(gradle, /versionCode 583\b/); assert.match(gradle, /versionName '58\.3'/);
assert.match(csproj, /<Version>58\.3\.0<\/Version>/);
assert.ok(html.includes("s.version=58") && html.includes('brand-ver">V58'), "app version must be V58");
assert.ok(sw.includes("jamal-life-v58-3"), "service worker cache must be V58");

// branding
assert.equal(manifest.name, "Jamal Life");
assert.ok(!/Life Control/.test(html), "old name left in the app");
for (const f of ["icon.svg", "icon-192.png", "icon-512.png", "desktop/app.ico", "android/app/src/main/res/raw/jamal_chime.wav"]) assert.ok(existsSync(new URL(f, root)), "missing " + f);
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
assert.ok(notif.includes("R.raw.jamal_chime") && notif.includes("IMPORTANCE_HIGH"), "Android chime channel");
assert.ok(desktop.includes("NotifyIcon") && desktop.includes("__jlTick") && desktop.includes("WebMessageReceived"), "Windows tray + notifications");

// secrets never ship to the browser
for (const bad of ["SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "sb_secret_"]) assert.ok(!html.includes(bad), "secret reference in app: " + bad);
assert.ok(fn.includes('Deno.env.get("GEMINI_API_KEY")') && fn.includes("auth.getUser"), "AI function auth/secret");
assert.ok(fn.includes("ai_usage") && /thinking_level: "low",\n\s*generation_config/.test(fn), "AI function rate limit / request shape");
assert.ok(read("supabase/config.toml").includes("verify_jwt = true"));

console.log("JAMAL_LIFE_V58_STATIC_QA_OK");
