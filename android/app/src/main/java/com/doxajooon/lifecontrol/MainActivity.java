package com.doxajooon.lifecontrol;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import java.lang.ref.WeakReference;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {
    private static final int REQ_NOTIFICATIONS = 42;
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + ASSET_HOST + "/assets/index.html";
    // Supabase Auth/REST/Edge Functions are reached over HTTPS from the WebView; the browser session stays in WebView cookies/storage.

    private static final int BG_DARK = 0xFF0D1722;
    private static final int BG_LIGHT = 0xFFF5F7FA;

    private WebView webView;
    private FrameLayout rootView;
    private WebViewAssetLoader assetLoader;

    // Fingerprint / phone PIN lock (optional, per device).
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private static final long RELOCK_AFTER_MS = 60_000;
    private View lockView;
    private boolean unlocked = false, prompting = false;
    private long stoppedAt = 0, promptEndedAt = 0;
    private static WeakReference<MainActivity> resumed = new WeakReference<>(null);
    private String launchAction = null; // «+» on the widget → quick add in the web app

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(ASSET_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        // No forced LAYER_TYPE_HARDWARE: on many phones it makes the WebView flicker while scrolling.

        // Same edge-to-edge behaviour on every Android version: the window draws under the system bars
        // and the root view pads the WebView by the bar / cutout / keyboard insets.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        rootView = new FrameLayout(this);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(rootView);
        if (lockEnabled()) showLockView();
        applyBarTheme(getSharedPreferences("lc_ui", Context.MODE_PRIVATE).getBoolean("dark", true));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            if (webView.getUrl() == null) webView.loadUrl(APP_URL);
        } else {
            webView.loadUrl(APP_URL);
        }

        if (JamalWidget.QUICK_ADD.equals(getIntent().getAction())) launchAction = "quickadd";
        requestNotificationPermission();
        AlarmScheduler.dropLegacy(getApplicationContext());
        NotificationUtil.ensureChannel(getApplicationContext());
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setMediaPlaybackRequiresUserGesture(false);

        WebSettings s = ws;
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);
        s.setGeolocationEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = assetLoader.shouldInterceptRequest(request.getUrl());
                return local != null ? local : super.shouldInterceptRequest(view, request);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                WebResourceResponse local = assetLoader.shouldInterceptRequest(Uri.parse(url));
                return local != null ? local : super.shouldInterceptRequest(view, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(view, request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(view, Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                        "try{document.documentElement.style.webkitOverflowScrolling='touch';window.scrollTo(0,0)}catch(e){}",
                        null
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        if (Build.VERSION.SDK_INT >= 24) {
            ServiceWorkerController sw = ServiceWorkerController.getInstance();
            sw.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
            });
        }

        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
    }

    private boolean handleNavigation(WebView view, Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String path = uri.getPath();

        if ("https".equalsIgnoreCase(scheme)
                && "doxajooon.github.io".equalsIgnoreCase(host)
                && path != null
                && ("/life".equals(path) || "/life/".equals(path))) {
            Uri.Builder b = Uri.parse(APP_URL).buildUpon();
            if (uri.getQuery() != null) b.encodedQuery(uri.getQuery());
            if (uri.getFragment() != null) b.encodedFragment(uri.getFragment());
            view.loadUrl(b.build().toString());
            return true;
        }

        if ("https".equalsIgnoreCase(scheme) && ASSET_HOST.equalsIgnoreCase(host)) return false;
        // Any other site (AI sources, help links) opens in the phone's browser, never inside the app:
        // pages inside this WebView would get access to AndroidBridge.

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось открыть ссылку", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void showLoadError() {
        if (webView == null) return;
        webView.loadDataWithBaseURL(
                APP_URL,
                "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                        "<body style='font-family:sans-serif;background:#101827;color:white;padding:24px'>" +
                        "<h2>" + getString(R.string.app_name) + "</h2>" +
                        "<p>Не удалось загрузить приложение.</p>" +
                        "<p style='opacity:.7'>Повторная попытка загрузит локальную версию приложения.</p>" +
                        "<a href='" + APP_URL + "' style='display:inline-block;padding:12px 18px;background:#fff;color:#101827;text-decoration:none;border-radius:8px'>Повторить</a>" +
                        "</body>",
                "text/html", "UTF-8", null
        );
    }

    /** Keeps system bars and the area behind them in the same colour family as the in-app theme. */
    void applyBarTheme(boolean dark) {
        int bg = dark ? BG_DARK : BG_LIGHT;
        if (rootView != null) rootView.setBackgroundColor(bg);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(bg);
            w.setNavigationBarColor(bg);
        }
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        resumed = new WeakReference<>(this);
        if (lockEnabled()) {
            if (stoppedAt > 0 && SystemClock.elapsedRealtime() - stoppedAt > RELOCK_AFTER_MS) unlocked = false;
            if (!unlocked) {
                showLockView();
                if (!prompting && SystemClock.elapsedRealtime() - promptEndedAt > 1500) promptUnlock();
            }
        } else {
            unlocked = true;
            hideLockView();
        }
        deliverActions();
    }

    @Override protected void onPause() {
        if (resumed.get() == this) resumed = new WeakReference<>(null);
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (JamalWidget.QUICK_ADD.equals(intent.getAction()) && webView != null) {
            launchAction = "quickadd";
            webView.evaluateJavascript("window.__jlLaunch&&window.__jlLaunch()", null);
        }
    }

    @Override protected void onStop() {
        super.onStop();
        if (!prompting) stoppedAt = SystemClock.elapsedRealtime();
    }

    /** Hands «Готово» pressed in a notification to the web app if it is on screen right now. */
    static void deliverActions() {
        MainActivity a = resumed.get();
        if (a == null || a.webView == null) return;
        a.runOnUiThread(() -> { if (a.webView != null) a.webView.evaluateJavascript("window.__jlNativeActions&&window.__jlNativeActions()", null); });
    }

    // ---------- fingerprint lock ----------
    boolean lockEnabled() { return getSharedPreferences("lc_ui", Context.MODE_PRIVATE).getBoolean("biometric", false); }

    static String biometricStatus(Context ctx) {
        int r = BiometricManager.from(ctx).canAuthenticate(AUTH);
        if (r == BiometricManager.BIOMETRIC_SUCCESS) return "ok";
        if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "not_enrolled";
        return "none";
    }

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private void showLockView() {
        if (lockView == null) {
            // 74.4: a calm lock screen — the sprout and the name on the app's own blue, no grey system button and no extra text;
            // the fingerprint window opens by itself, and a tap anywhere opens it again
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable(
                    android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF14284A, 0xFF0F1D33, 0xFF0C182B});
            box.setBackground(bg);
            box.setClickable(true);
            box.setOnClickListener(v -> { if (!prompting) promptUnlock(); });
            box.setPadding(dp(32), dp(32), dp(32), dp(32));
            ImageView logo = new ImageView(this);
            logo.setImageResource(R.drawable.ic_launcher_foreground);
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            box.addView(logo, new LinearLayout.LayoutParams(dp(132), dp(132)));
            TextView name = new TextView(this);
            name.setText(R.string.app_name);
            name.setTextColor(0xFFF3F7FC);
            name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
            name.setTypeface(name.getTypeface(), android.graphics.Typeface.BOLD);
            name.setGravity(Gravity.CENTER);
            name.setPadding(0, dp(4), 0, 0);
            box.addView(name);
            lockView = box;
            rootView.addView(lockView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        }
        lockView.setVisibility(View.VISIBLE);
        lockView.bringToFront();
    }

    private void hideLockView() { if (lockView != null) lockView.setVisibility(View.GONE); }

    private void promptUnlock() {
        if (!"ok".equals(biometricStatus(this))) { unlocked = true; hideLockView(); return; } // nothing to check with — never lock the owner out
        prompting = true;
        BiometricPrompt p = new BiometricPrompt(this, ContextCompat.getMainExecutor(this), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                prompting = false; promptEndedAt = SystemClock.elapsedRealtime(); unlocked = true; stoppedAt = 0; hideLockView();
                // 74.5: straight to the main screen — no «Открыто / Подтвердить» step in between
                if (webView != null) webView.evaluateJavascript("window.__jlUnlocked&&window.__jlUnlocked()", null);
            }
            @Override public void onAuthenticationError(int code, CharSequence msg) {
                prompting = false; promptEndedAt = SystemClock.elapsedRealtime();
            }
        });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.app_name))
                .setSubtitle("Приложи палец")
                .setAllowedAuthenticators(AUTH)
                .setConfirmationRequired(false) // 74.5: the finger opens the app at once (no extra «Открыто» confirmation)
                .build();
        try { p.authenticate(info); } catch (Exception e) { prompting = false; unlocked = true; hideLockView(); }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("AndroidBridge");
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public static class AndroidBridge {
        private final MainActivity activity;
        private final Context ctx;

        AndroidBridge(MainActivity activity) {
            this.activity = activity;
            this.ctx = activity.getApplicationContext();
        }

        @JavascriptInterface public void requestNotifications() {
            activity.runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33) activity.requestNotificationPermission();
                if (Build.VERSION.SDK_INT >= 31) {
                    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                    if (am != null && !am.canScheduleExactAlarms()) {
                        try {
                            Intent i = new Intent(
                                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                    Uri.parse("package:" + ctx.getPackageName())
                            );
                            activity.startActivity(i);
                        } catch (Exception ignored) {}
                    }
                }
            });
        }

        @JavascriptInterface public void setTheme(boolean dark) {
            ctx.getSharedPreferences("lc_ui", Context.MODE_PRIVATE).edit().putBoolean("dark", dark).apply();
            activity.runOnUiThread(() -> activity.applyBarTheme(dark));
        }

        @JavascriptInterface public void notify(String title, String body) {
            NotificationUtil.show(ctx, title, body, 0);
        }

        @JavascriptInterface public void scheduleDaily(String id, String time, String title, String body) {
            AlarmScheduler.schedule(ctx, id, time, title, body);
        }

        /** 74.2: a daily alarm only on some weekdays — days is 7 chars Mon..Sun, "1" = ring (the schedule by weekday). */
        @JavascriptInterface public void scheduleDailyDays(String id, String time, String days, String title, String body) {
            AlarmScheduler.schedule(ctx, id, time, days, title, body);
        }

        @JavascriptInterface public void cancelDaily(String id) {
            AlarmScheduler.cancel(ctx, id);
        }

        /** One-off reminder (tasks): fires at the given moment even if the app is closed. */
        @JavascriptInterface public void scheduleOnce(String id, double atMillis, String title, String body) {
            AlarmScheduler.scheduleOnce(ctx, id, atMillis, title, body);
        }

        /** Task reminder with the task time: the notification shows a live countdown to it. */
        @JavascriptInterface public void scheduleTask(String id, double atMillis, String title, String body, double dueMillis) {
            AlarmScheduler.scheduleOnce(ctx, id, atMillis, title, body, dueMillis);
        }

        @JavascriptInterface public void notifyTaskAt(String title, String body, String taskId, double dueMillis) {
            NotificationUtil.show(ctx, title, body, ("task_" + taskId).hashCode(), taskId, (long) dueMillis);
        }

        /** Short preview of the reminder sound (settings → «Проверить звук»). */
        @JavascriptInterface public void previewSound() {
            NotificationUtil.show(ctx, ctx.getString(R.string.app_name), "Так звучат напоминания ✨", 4242, null, 0, false, true);
        }

        @JavascriptInterface public void cancel(String id) {
            AlarmScheduler.cancel(ctx, id);
        }

        /** Same as notify, with the buttons «Готово» and «Через 15 мин» for a task. */
        @JavascriptInterface public void notifyTask(String title, String body, String taskId) {
            NotificationUtil.show(ctx, title, body, ("task_" + taskId).hashCode(), taskId);
        }

        /** Buttons pressed in notifications while the app was closed (JSON array), cleared on read. */
        @JavascriptInterface public String takeActions() { return PendingActions.take(ctx); }

        @JavascriptInterface public String biometricStatus() { return MainActivity.biometricStatus(ctx); }

        @JavascriptInterface public boolean isBiometricOn() {
            return ctx.getSharedPreferences("lc_ui", Context.MODE_PRIVATE).getBoolean("biometric", false);
        }

        @JavascriptInterface public boolean setBiometric(boolean on) {
            if (on && !"ok".equals(MainActivity.biometricStatus(ctx))) return false;
            ctx.getSharedPreferences("lc_ui", Context.MODE_PRIVATE).edit().putBoolean("biometric", on).apply();
            if (on) activity.runOnUiThread(() -> activity.unlocked = true); // already inside: don't lock right now
            return true;
        }

        /** Schedule and tasks for the home-screen widget (JSON). */
        @JavascriptInterface public void updateWidget(String json) { JamalWidget.save(ctx, json); }

        /** What the app was opened for (widget «+» → "quickadd"), read once. */
        @JavascriptInterface public String takeLaunch() {
            String a = activity.launchAction; activity.launchAction = null; return a == null ? "" : a;
        }

        /** «Громкие напоминания (как будильник)»: true → alarm volume (channel jamal_life_dawn2), false → notification volume. */
        @JavascriptInterface public void setLoudReminders(boolean on) { NotificationUtil.setLoud(ctx, on); }

        @JavascriptInterface public boolean isLoudReminders() { return NotificationUtil.isLoud(ctx); }

        @JavascriptInterface public int bridgeVersion() { return 7; }
    }
}