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

assert.equal(pkg.version, "44.0.0", "package version must match V44");
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

assert.ok(sw.includes("life-control-v44-gemini"), "service worker cache must be V44");
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


console.log("LIFE_CONTROL_V44_STATIC_QA_OK");
