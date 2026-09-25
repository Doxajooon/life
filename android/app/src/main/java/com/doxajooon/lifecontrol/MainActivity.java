package com.doxajooon.lifecontrol;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.CookieManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.util.Calendar;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private static final int REQ_NOTIFICATIONS = 42;
    private static final String DOMAIN = "appassets.androidplatform.net";

    @Override public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return loader.shouldInterceptRequest(Uri.parse(url));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();
                String path = uri.getPath();
                // Supabase Auth redirects to the public GitHub Pages callback.
                // Keep the user inside the native WebView and feed the callback
                // query/hash back into the bundled offline-first app.
                if ("https".equalsIgnoreCase(scheme)
                        && "doxajooon.github.io".equalsIgnoreCase(host)
                        && path != null
                        && ("/life".equals(path) || "/life/".equals(path))) {
                    StringBuilder local = new StringBuilder("https://")
                            .append(DOMAIN).append("/assets/index.html");
                    if (uri.getQuery() != null) local.append("?").append(uri.getQuery());
                    if (uri.getFragment() != null) local.append("#").append(uri.getFragment());
                    view.loadUrl(local.toString());
                    return true;
                }
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {}
                return true;
            }
            @Override public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (view.getUrl() == null || view.getUrl().equals(failingUrl)) {
                    view.loadDataWithBaseURL(
                        "https://" + DOMAIN + "/assets/",
                        "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                        "<body style='font-family:sans-serif;background:#101827;color:white;padding:24px'>" +
                        "<h2>Life Control</h2><p>Не удалось загрузить приложение.</p>" +
                        "<p style='opacity:.7'>Проверь интернет и нажми «Повторить».</p>" +
                        "<button onclick='location.reload()' style='padding:12px 18px'>Повторить</button></body>",
                        "text/html", "UTF-8", null
                    );
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) webView.getSettings().setSafeBrowsingEnabled(true);
        if (Build.VERSION.SDK_INT >= 21) webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl("https://" + DOMAIN + "/assets/index.html");
        }
        requestNotificationPermission();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    public static class AndroidBridge {
        private final MainActivity activity;
        private final Context ctx;
        AndroidBridge(MainActivity activity) { this.activity = activity; this.ctx = activity.getApplicationContext(); }

        @JavascriptInterface public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33) {
                activity.runOnUiThread(activity::requestNotificationPermission);
            }
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    try {
                        Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.getPackageName()));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(i);
                    } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface public void notify(String title, String body) {
            NotificationUtil.show(ctx, title, body, 0);
        }

        @JavascriptInterface public void scheduleDaily(String id, String time, String title, String body) {
            AlarmScheduler.schedule(ctx, id, time, title, body);
        }

        @JavascriptInterface public void cancelDaily(String id) {
            AlarmScheduler.cancel(ctx, id);
        }
    }
}
