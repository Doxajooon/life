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
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {
    private static final int REQ_NOTIFICATIONS = 42;
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + ASSET_HOST + "/assets/index.html";

    private WebView webView;
    private WebViewAssetLoader assetLoader;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(ASSET_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setContentView(webView);

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            if (webView.getUrl() == null) webView.loadUrl(APP_URL);
        } else {
            webView.loadUrl(APP_URL);
        }

        requestNotificationPermission();
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(true);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
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

        // The app is offline-first, but Supabase/Auth/AI require HTTPS network access.
        // Do not intercept normal HTTPS requests: WebView must be allowed to reach Supabase.
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
                // Re-apply the app viewport after auth redirects/restores.
                view.evaluateJavascript(
                        "try{document.documentElement.style.webkitOverflowScrolling='touch';window.scrollTo(0,0)}catch(e){}",
                        null
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // Service-worker requests must also be able to resolve bundled assets.
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

        // Supabase Auth redirects here. Keep the callback inside the native app,
        // preserving both query and hash tokens used by recovery/auth flows.
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

        // Local bundled app navigation is handled by WebView.
        if ("https".equalsIgnoreCase(scheme)
                && ASSET_HOST.equalsIgnoreCase(host)) return false;

        // HTTPS/HTTP external pages remain in WebView so OAuth and Supabase
        // redirects can complete without leaving the app.
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) return false;

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
                        "<h2>Life Control</h2>" +
                        "<p>Не удалось загрузить приложение.</p>" +
                        "<p style='opacity:.7'>Повторная попытка загрузит локальную версию приложения.</p>" +
                        "<a href='" + APP_URL + "' style='display:inline-block;padding:12px 18px;background:#fff;color:#101827;text-decoration:none;border-radius:8px'>Повторить</a>" +
                        "</body>",
                "text/html", "UTF-8", null
        );
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
            webView.removeJavascriptInterface("AndroidBridge");
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
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
