package com.chanclastudio.dayflow.widget

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Minimal Supabase REST helper used by the widget process. Runs on a worker
 * thread (caller's responsibility — these methods block on network).
 */
object SupabaseRest {
    private const val TAG = "DayFlowWidget"

    private val ymd = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getDefault()
    }

    /** today / +6 days in the device's local timezone. */
    fun todayStr(): String = ymd.format(Date())

    fun daysFromNow(offset: Int): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, offset)
        return ymd.format(cal.time)
    }

    /**
     * Returns a usable access token, refreshing if it's within 60s of expiry.
     * Returns null if we have no auth or refresh failed.
     */
    fun ensureAccessToken(ctx: Context): WidgetStore.Auth? {
        val auth = WidgetStore.readAuth(ctx)
        if (auth == null) {
            Log.w(TAG, "ensureAccessToken: no auth in prefs — open the app once so the web can syncWidgetAuth()")
            return null
        }
        val nowSec = System.currentTimeMillis() / 1000
        if (auth.expiresAt > nowSec + 60) {
            // Token is still valid; no need to refresh.
            return auth
        }
        Log.d(TAG, "ensureAccessToken: token expired (expiresAt=${auth.expiresAt} now=$nowSec) — refreshing")
        val refreshed = refreshSession(ctx, auth)
        if (refreshed == null) {
            Log.w(TAG, "ensureAccessToken: refresh failed — refresh_token likely expired (~30d), open the app to re-sync")
        }
        return refreshed
    }

    private fun refreshSession(ctx: Context, auth: WidgetStore.Auth): WidgetStore.Auth? {
        val url = "${auth.supabaseUrl}/auth/v1/token?grant_type=refresh_token"
        val body = JSONObject().put("refresh_token", auth.refreshToken).toString()
        val resp = httpJson("POST", url, body, mapOf(
            "apikey"        to auth.anonKey,
            "Authorization" to "Bearer ${auth.anonKey}",
        )) ?: return null
        if (resp.status !in 200..299) {
            Log.w(TAG, "refresh failed: ${resp.status} ${resp.body.take(200)}")
            return null
        }
        val obj = runCatching { JSONObject(resp.body) }.getOrNull() ?: return null
        val newAccess  = obj.optString("access_token")
        val newRefresh = obj.optString("refresh_token", auth.refreshToken)
        val expiresIn  = obj.optLong("expires_in", 3600L)
        if (newAccess.isBlank()) return null
        val newExpiresAt = System.currentTimeMillis() / 1000 + expiresIn
        WidgetStore.updateAccess(ctx, newAccess, newRefresh, newExpiresAt)
        return auth.copy(accessToken = newAccess, refreshToken = newRefresh, expiresAt = newExpiresAt)
    }

    /**
     * Fetch activities for the next 30 days for the current user, plus any
     * completed activities for today. Returns the JSON array body (or null).
     */
    fun fetchActivities(ctx: Context): JSONArray? {
        val auth = ensureAccessToken(ctx) ?: return null
        val today = todayStr()
        val until = daysFromNow(30)
        val select = "id,title,emoji,start_time,end_time,status,category,date,user_id"
        val q = "select=$select&user_id=eq.${auth.userId}" +
                "&date=gte.$today&date=lte.$until" +
                "&order=date.asc,start_time.asc.nullslast"
        val url = "${auth.supabaseUrl}/rest/v1/activities?$q"
        val resp = httpJson("GET", url, null, mapOf(
            "apikey"        to auth.anonKey,
            "Authorization" to "Bearer ${auth.accessToken}",
        )) ?: return null
        if (resp.status !in 200..299) {
            Log.w(TAG, "fetch activities failed: ${resp.status} ${resp.body.take(200)}")
            return null
        }

        // Append today's completed activities (which we'd otherwise miss because
        // the snapshot writer also includes them — keeping parity here)
        val list = runCatching { JSONArray(resp.body) }.getOrNull() ?: JSONArray()
        return list
    }

    /**
     * PATCH the status of one activity. Uses `Prefer: return=representation`
     * so we can verify that a row actually came back — Supabase returns 200
     * with an empty `[]` body when the filter matches nothing (e.g. RLS
     * denied the row), and we need to detect that as a failure.
     */
    fun updateStatus(ctx: Context, activityId: String, status: String): Boolean {
        if (activityId.isBlank() || activityId == "null") {
            Log.w(TAG, "updateStatus skipped — invalid activityId='$activityId'")
            return false
        }
        val auth = ensureAccessToken(ctx)
        if (auth == null) {
            Log.w(TAG, "updateStatus failed — no auth (token refresh failed or user logged out)")
            return false
        }
        val url  = "${auth.supabaseUrl}/rest/v1/activities?id=eq.$activityId"
        val pct  = if (status == "done") 100 else 0
        val body = JSONObject()
            .put("status", status)
            .put("completion_percentage", pct)
            .toString()
        Log.d(TAG, "updateStatus id=$activityId → status=$status")
        val resp = httpJson("PATCH", url, body, mapOf(
            "apikey"        to auth.anonKey,
            "Authorization" to "Bearer ${auth.accessToken}",
            "Prefer"        to "return=representation",
        ))
        if (resp == null) {
            Log.w(TAG, "updateStatus network error for id=$activityId")
            return false
        }
        if (resp.status !in 200..299) {
            Log.w(TAG, "updateStatus HTTP ${resp.status} for id=$activityId — body=${resp.body.take(200)}")
            return false
        }
        // Supabase returns 200 + [] when 0 rows matched — surface that as failure.
        val rows = runCatching { JSONArray(resp.body) }.getOrNull()
        if (rows == null || rows.length() == 0) {
            Log.w(TAG, "updateStatus 200 but 0 rows updated for id=$activityId — likely RLS or stale id")
            return false
        }
        Log.d(TAG, "updateStatus OK for id=$activityId")
        return true
    }

    // ── HTTP ────────────────────────────────────────────────────────────────
    private data class HttpResp(val status: Int, val body: String)

    private fun httpJson(method: String, urlStr: String, body: String?, headers: Map<String, String>): HttpResp? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 8000
                readTimeout    = 12000
                doInput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept",       "application/json")
                headers.forEach { (k, v) -> setRequestProperty(k, v) }
                if (body != null) {
                    doOutput = true
                    OutputStreamWriter(outputStream, Charsets.UTF_8).use { it.write(body) }
                }
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text   = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use(BufferedReader::readText) } ?: ""
            HttpResp(status, text)
        } catch (t: Throwable) {
            Log.w(TAG, "http error: ${t.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }
}
