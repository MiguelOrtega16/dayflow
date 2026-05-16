package com.chanclastudio.dayflow.widget

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * App-private cache shared between the web layer (via WidgetBridgePlugin) and
 * the home-screen widget process. Holds the activity snapshot, the Supabase
 * auth tokens, and per-widget config (color + opacity).
 *
 * Nothing here calls the network — see [SupabaseRest] for that.
 */
object WidgetStore {
    private const val PREFS_NAME    = "dayflow_widget"
    private const val K_SNAPSHOT    = "snapshot_json"
    private const val K_SNAPSHOT_AT = "snapshot_ts"

    // Auth
    private const val K_SUPABASE_URL = "sb_url"
    private const val K_ANON_KEY     = "sb_anon"
    private const val K_ACCESS       = "sb_access"
    private const val K_REFRESH      = "sb_refresh"
    private const val K_EXPIRES_AT   = "sb_expires"
    private const val K_USER_ID      = "sb_user"

    // Per-widget config (suffixed by widgetId)
    private const val K_CFG_COLOR   = "cfg_color_"
    private const val K_CFG_OPACITY = "cfg_opacity_"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ── Snapshot ─────────────────────────────────────────────────────────────
    fun writeSnapshot(ctx: Context, json: String) {
        prefs(ctx).edit()
            .putString(K_SNAPSHOT, json)
            .putLong(K_SNAPSHOT_AT, System.currentTimeMillis())
            .apply()
    }

    fun readSnapshot(ctx: Context): JSONObject? {
        val raw = prefs(ctx).getString(K_SNAPSHOT, null) ?: return null
        return try { JSONObject(raw) } catch (_: Throwable) { null }
    }

    /** Convenience: returns the activities array from the snapshot, or empty. */
    fun readActivities(ctx: Context): JSONArray {
        val snap = readSnapshot(ctx) ?: return JSONArray()
        return snap.optJSONArray("activities") ?: JSONArray()
    }

    fun snapshotAge(ctx: Context): Long {
        val ts = prefs(ctx).getLong(K_SNAPSHOT_AT, 0L)
        if (ts == 0L) return Long.MAX_VALUE
        return System.currentTimeMillis() - ts
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    data class Auth(
        val supabaseUrl: String,
        val anonKey:     String,
        val accessToken: String,
        val refreshToken: String,
        val expiresAt:   Long,   // epoch seconds
        val userId:      String,
    )

    fun writeAuth(ctx: Context, a: Auth) {
        prefs(ctx).edit()
            .putString(K_SUPABASE_URL, a.supabaseUrl)
            .putString(K_ANON_KEY,     a.anonKey)
            .putString(K_ACCESS,       a.accessToken)
            .putString(K_REFRESH,      a.refreshToken)
            .putLong(K_EXPIRES_AT,     a.expiresAt)
            .putString(K_USER_ID,      a.userId)
            .apply()
    }

    fun readAuth(ctx: Context): Auth? {
        val p = prefs(ctx)
        val url   = p.getString(K_SUPABASE_URL, null) ?: return null
        val anon  = p.getString(K_ANON_KEY,     null) ?: return null
        val acc   = p.getString(K_ACCESS,       null) ?: return null
        val ref   = p.getString(K_REFRESH,      null) ?: return null
        val user  = p.getString(K_USER_ID,      null) ?: return null
        val exp   = p.getLong(K_EXPIRES_AT, 0L)
        return Auth(url, anon, acc, ref, exp, user)
    }

    /** Updates only the access token + expiry after a refresh. */
    fun updateAccess(ctx: Context, accessToken: String, refreshToken: String, expiresAt: Long) {
        prefs(ctx).edit()
            .putString(K_ACCESS,    accessToken)
            .putString(K_REFRESH,   refreshToken)
            .putLong(K_EXPIRES_AT,  expiresAt)
            .apply()
    }

    fun clearAuth(ctx: Context) {
        prefs(ctx).edit()
            .remove(K_SUPABASE_URL).remove(K_ANON_KEY)
            .remove(K_ACCESS).remove(K_REFRESH).remove(K_EXPIRES_AT).remove(K_USER_ID)
            .apply()
    }

    // ── Per-widget config ────────────────────────────────────────────────────
    fun writeConfig(ctx: Context, widgetId: Int, colorHex: String, opacityPct: Int) {
        prefs(ctx).edit()
            .putString(K_CFG_COLOR + widgetId, colorHex)
            .putInt(K_CFG_OPACITY + widgetId, opacityPct.coerceIn(20, 100))
            .apply()
    }

    /** Returns the header color (hex, e.g. "#7C6FE3"). Defaults to brand primary. */
    fun readColor(ctx: Context, widgetId: Int): String =
        prefs(ctx).getString(K_CFG_COLOR + widgetId, null) ?: "#7C6FE3"

    /** Returns the body opacity as 0–100 (default 95). */
    fun readOpacity(ctx: Context, widgetId: Int): Int =
        prefs(ctx).getInt(K_CFG_OPACITY + widgetId, 95)

    fun clearConfig(ctx: Context, widgetId: Int) {
        prefs(ctx).edit()
            .remove(K_CFG_COLOR + widgetId)
            .remove(K_CFG_OPACITY + widgetId)
            .apply()
    }
}
