package com.chanclastudio.dayflow.deeplink

import android.content.Context

/**
 * SharedPreferences-backed queue for pending in-app deep links. Used to
 * bridge cold-start navigation (notification or widget tap that *launches*
 * the app rather than resuming it) into the JS layer.
 *
 * The flow that motivated this: tapping the daily-summary notification's
 * "+ Task" action while the app is fully closed launches MainActivity,
 * which posts evaluateJavascript("window.location.href = …") on the
 * WebView. On cold start the WebView is still loading its initial page,
 * so that eval either runs in a stale JS context or gets eaten by the
 * upcoming page load — the user lands on the dashboard with no modal
 * open. Stashing the path here means the JS layer can pick it up on
 * dashboard-shell mount (when we know the bridge is alive) and navigate
 * deterministically.
 *
 * For warm-path taps (app already in memory, onNewIntent runs while
 * dashboard is mounted) the existing evaluateJavascript in MainActivity
 * still fires and produces the expected behaviour without needing this
 * fallback.
 */
object DeepLinkStore {
    private const val PREFS = "dayflow_deeplink"
    private const val K_PENDING = "pending_path"

    fun setPending(ctx: Context, path: String) {
        ctx.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(K_PENDING, path)
            .apply()
    }

    /** Reads the pending path and clears it atomically — guarantees one
     *  consumer (the JS dashboard-shell mount handler). */
    fun consumePending(ctx: Context): String? {
        val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val path = p.getString(K_PENDING, null)
        if (path != null) p.edit().remove(K_PENDING).apply()
        return path
    }
}
