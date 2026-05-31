package com.chanclastudio.dayflow;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.chanclastudio.dayflow.widget.WidgetBridgePlugin;
import com.chanclastudio.dayflow.system.SystemSettingsPlugin;
import com.chanclastudio.dayflow.summary.DailySummaryPlugin;
import com.chanclastudio.dayflow.deeplink.DeepLinkPlugin;
import com.chanclastudio.dayflow.deeplink.DeepLinkStore;

public class MainActivity extends BridgeActivity {
    /** True while super.onCreate hasn't run yet (cold start). Lets the
     *  intent handler decide whether to do an immediate evaluateJavascript
     *  (warm path, WebView already loaded) or stash to SharedPreferences
     *  for the dashboard-shell to consume on mount (cold path, WebView
     *  still spinning up). */
    private boolean coldStart = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(SystemSettingsPlugin.class);
        registerPlugin(DailySummaryPlugin.class);
        registerPlugin(DeepLinkPlugin.class);
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
        coldStart = false;
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Persist WebView cookies — including the long-lived Supabase auth/session
        // cookie — to disk whenever the app goes to the background. Android's
        // WebView holds cookies in memory and only flushes them lazily, so if the
        // OS kills the process before a flush, the session is lost and the user is
        // forced to log in again on the next cold start. Flushing here guarantees
        // the (already 400-day) auth cookie survives app restarts. flush() is
        // cheap and idempotent.
        CookieManager.getInstance().flush();
    }

    /**
     * Tap-handler for widget / notification actions that need to navigate
     * the WebView (e.g. the gear button on the widget opens
     * /dashboard/widget/{id}, or the daily-summary "+ Task" opens
     * /dashboard?create=today&type=task).
     *
     * Two paths because the WebView readiness is different on cold vs warm:
     *   - Cold start: the WebView is still loading the initial page when
     *     we run inside onCreate, so evaluateJavascript runs in a stale or
     *     non-existent JS context and the navigation is lost. We stash the
     *     path in SharedPreferences and the dashboard shell consumes it
     *     on its mount handler (see DeepLinkPlugin + DashboardShellInner).
     *   - Warm path (onNewIntent): the WebView is fully loaded and the
     *     dashboard is already mounted. evaluateJavascript triggers an
     *     immediate URL change and downstream useEffects fire.
     */
    private void handleDeepLink(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra("dayflow:gotoPath");
        if (path == null || path.isEmpty()) return;

        if (coldStart) {
            DeepLinkStore.INSTANCE.setPending(this, path);
            return;
        }

        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.post(() -> wv.evaluateJavascript(
            "window.location.href = '" + path.replace("'", "\\'") + "'", null));
    }
}
