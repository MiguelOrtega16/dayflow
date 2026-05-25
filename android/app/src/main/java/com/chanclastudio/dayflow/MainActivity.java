package com.chanclastudio.dayflow;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.chanclastudio.dayflow.widget.WidgetBridgePlugin;
import com.chanclastudio.dayflow.system.SystemSettingsPlugin;
import com.chanclastudio.dayflow.summary.DailySummaryPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(SystemSettingsPlugin.class);
        registerPlugin(DailySummaryPlugin.class);
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    /**
     * Tap-handler for widget actions that need to navigate the WebView
     * (e.g. the gear button on the widget opens /dashboard/widget/{id}).
     */
    private void handleDeepLink(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra("dayflow:gotoPath");
        if (path == null || path.isEmpty()) return;
        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        // Slight delay so the bridge has settled before we navigate
        wv.post(() -> wv.evaluateJavascript(
            "window.location.href = '" + path.replace("'", "\\'") + "'", null));
    }
}
