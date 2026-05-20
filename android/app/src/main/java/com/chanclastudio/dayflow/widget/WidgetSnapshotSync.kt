package com.chanclastudio.dayflow.widget

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Single owner of the widget snapshot pipeline:
 *   1. fetch the activities window from Supabase REST,
 *   2. compute stats (streak / today_done / today_total) and the soonest
 *      upcoming activity,
 *   3. write the full snapshot to SharedPreferences,
 *   4. re-render Today + Streak + NextUp providers on the main thread.
 *
 * Mirrors the JS-side logic in lib/widget-sync.ts so opening the app and a
 * widget self-refresh produce identical snapshots. Everything network-bound
 * runs on a daemon worker thread so widget render paths stay non-blocking.
 */
object WidgetSnapshotSync {
    private const val TAG = "DayFlowWidget"
    /** Anything older triggers a refetch when checked via refreshIfStale.
     *  Matches the "show last-sync age when older than 5 min" indicator in
     *  TodayWidgetProvider so the two thresholds don't disagree. */
    private const val FRESH_WINDOW_MS = 5L * 60_000L

    private val mainHandler = Handler(Looper.getMainLooper())

    // SimpleDateFormat isn't thread-safe and refresh() may overlap (e.g. a
    // user adds two widgets in quick succession, both providers fire
    // refreshIfStale on the same launcher tick) — build a fresh formatter
    // each call instead of caching one at module scope.
    private fun ymdFormatter(): SimpleDateFormat =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = TimeZone.getDefault()
        }

    /** Always fetch + rebuild + render. Returns immediately; work runs on a
     *  background thread. Fails silently if auth is missing or the network
     *  call fails — widgets keep showing the last good snapshot. */
    fun refresh(ctx: Context) {
        Thread({
            try {
                val list = SupabaseRest.fetchActivities(ctx)
                if (list == null) {
                    Log.w(TAG, "snapshot refresh skipped — fetch returned null")
                    return@Thread
                }
                val snapshot = buildSnapshot(list)
                WidgetStore.writeSnapshot(ctx, snapshot.toString())
                mainHandler.post {
                    TodayWidgetProvider.renderAll(ctx)
                    StreakWidgetProvider.renderAll(ctx)
                    NextUpWidgetProvider.renderAll(ctx)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "snapshot refresh failed", t)
            }
        }, "DayFlowWidgetSync").apply { isDaemon = true }.start()
    }

    /** Cheap idempotent check used from each provider's onUpdate — only hits
     *  the network if the cached snapshot is missing or older than
     *  FRESH_WINDOW_MS. Lets a freshly placed widget pull its own data
     *  without waiting for the app to be opened. */
    fun refreshIfStale(ctx: Context) {
        if (WidgetStore.snapshotAge(ctx) >= FRESH_WINDOW_MS) refresh(ctx)
    }

    /** Build the full snapshot JSON from the wide activity window. The shape
     *  matches what the JS in lib/widget-sync.ts writes:
     *    { activities: [today+future, slim],
     *      stats: { streak_days, today_done, today_total },
     *      next:  { id, title, emoji, date, start_time } | null }  */
    private fun buildSnapshot(rows: JSONArray): JSONObject {
        val ymd = ymdFormatter()
        val today = ymd.format(Date())

        // ── Today + future, slim shape for the Today widget list ──
        val slim = JSONArray()
        for (i in 0 until rows.length()) {
            val o = rows.optJSONObject(i) ?: continue
            val date = o.optString("date")
            if (date.isBlank() || date < today) continue
            val slimRow = JSONObject().apply {
                put("id",         o.optString("id"))
                put("title",      o.optString("title"))
                put("emoji",      o.opt("emoji"))
                put("date",       date)
                put("start_time", o.opt("start_time"))
                put("status",     o.optString("status"))
            }
            slim.put(slimRow)
        }

        // ── Stats: streak / today completion ──
        // doneByDate is a set of yyyy-MM-dd strings that have at least one
        // completed activity; that's all the streak walker needs.
        val doneByDate = HashSet<String>()
        var todayDone = 0
        var todayTotal = 0
        for (i in 0 until rows.length()) {
            val o = rows.optJSONObject(i) ?: continue
            val date = o.optString("date")
            val status = o.optString("status")
            if (status == "done") doneByDate.add(date)
            if (date == today) {
                todayTotal++
                if (status == "done") todayDone++
            }
        }

        // Walk backward from today (skipping today if it has no completion yet
        // — matches the JS behavior so the streak doesn't drop to 0 simply
        // because nothing's been checked off today).
        var streak = 0
        val cal = Calendar.getInstance().apply { time = Date() }
        if (!doneByDate.contains(ymd.format(cal.time))) {
            cal.add(Calendar.DAY_OF_YEAR, -1)
        }
        while (streak <= 365 && doneByDate.contains(ymd.format(cal.time))) {
            streak++
            cal.add(Calendar.DAY_OF_YEAR, -1)
        }

        val stats = JSONObject()
            .put("streak_days", streak)
            .put("today_done",  todayDone)
            .put("today_total", todayTotal)

        // ── Next: soonest pending activity with a start_time, today or later.
        // Today entries whose start_time has already passed are skipped so the
        // NextUp tile shows something the user can still act on.
        val now = Calendar.getInstance()
        val nowMinutesSinceMidnight = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)

        var bestDate: String? = null
        var bestTime: String? = null
        var bestRow: JSONObject? = null
        for (i in 0 until rows.length()) {
            val o = rows.optJSONObject(i) ?: continue
            if (o.optString("status") == "done") continue
            val start = o.optString("start_time").takeIf { it.isNotBlank() && it != "null" } ?: continue
            val date = o.optString("date").takeIf { it.isNotBlank() } ?: continue
            if (date < today) continue
            if (date == today) {
                // Time format HH:mm[:ss] — only the first two segments matter.
                val parts = start.split(":")
                if (parts.size < 2) continue
                val h = parts[0].toIntOrNull() ?: continue
                val m = parts[1].toIntOrNull() ?: continue
                if (h * 60 + m <= nowMinutesSinceMidnight) continue
            }
            val current = bestDate
            val takeIt = current == null ||
                date < current ||
                (date == current && (bestTime == null || start < bestTime!!))
            if (takeIt) {
                bestDate = date
                bestTime = start
                bestRow  = o
            }
        }

        val next: Any = bestRow?.let {
            JSONObject()
                .put("id",         it.optString("id"))
                .put("title",      it.optString("title"))
                .put("emoji",      it.opt("emoji"))
                .put("date",       it.optString("date"))
                .put("start_time", it.optString("start_time"))
        } ?: JSONObject.NULL

        return JSONObject()
            .put("activities", slim)
            .put("stats", stats)
            .put("next", next)
    }
}
