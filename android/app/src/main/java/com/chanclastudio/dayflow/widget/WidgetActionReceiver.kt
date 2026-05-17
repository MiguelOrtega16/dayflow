package com.chanclastudio.dayflow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject

/**
 * Single entry point for all widget user actions. Dispatches by action string.
 *  - ACTION_REFRESH    → re-fetch activities from Supabase
 *  - ACTION_ROW_CLICK  → toggle done status of the activity in the extras
 */
class WidgetActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_REFRESH   = "com.chanclastudio.dayflow.widget.REFRESH"
        const val ACTION_ROW_CLICK = "com.chanclastudio.dayflow.widget.ROW_CLICK"

        const val EXTRA_ACTIVITY_ID    = "activity_id"
        const val EXTRA_CURRENTLY_DONE = "currently_done"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            ACTION_REFRESH   -> handleRefresh(ctx)
            ACTION_ROW_CLICK -> handleRowClick(ctx, intent)
        }
    }

    private fun handleRefresh(ctx: Context) {
        runOnIo {
            val list = SupabaseRest.fetchActivities(ctx) ?: return@runOnIo
            val snap = JSONObject().put("activities", list)
            WidgetStore.writeSnapshot(ctx, snap.toString())
            mainHandler.post { TodayWidgetProvider.renderAll(ctx) }
        }
    }

    private fun handleRowClick(ctx: Context, intent: Intent) {
        val id        = intent.getStringExtra(EXTRA_ACTIVITY_ID)
        val wasDone   = intent.getBooleanExtra(EXTRA_CURRENTLY_DONE, false)
        Log.d("DayFlowWidget", "ROW_CLICK received id=$id wasDone=$wasDone")
        if (id.isNullOrBlank() || id == "null") {
            Log.w("DayFlowWidget", "ROW_CLICK ignored — empty/invalid activity id")
            return
        }
        val newStatus = if (wasDone) "todo" else "done"

        // Optimistic local update so the widget redraws instantly
        optimisticUpdate(ctx, id, newStatus)
        mainHandler.post { TodayWidgetProvider.renderAll(ctx) }

        // Push to Supabase, then re-sync from DB on BOTH paths. If the PATCH
        // failed (auth, RLS, 0 rows), the refetch overwrites the optimistic
        // snapshot with truth so the widget can't get stuck in a wrong state.
        runOnIo {
            val ok = SupabaseRest.updateStatus(ctx, id, newStatus)
            val list = SupabaseRest.fetchActivities(ctx)
            if (list != null) {
                val snap = JSONObject().put("activities", list)
                WidgetStore.writeSnapshot(ctx, snap.toString())
            } else {
                Log.w("DayFlowWidget", "post-update refetch failed; widget may show stale state until next refresh (ok=$ok)")
            }
            mainHandler.post { TodayWidgetProvider.renderAll(ctx) }
        }
    }

    /** Mutate the cached snapshot in place — purely cosmetic until the round-trip lands. */
    private fun optimisticUpdate(ctx: Context, activityId: String, status: String) {
        val snap = WidgetStore.readSnapshot(ctx) ?: return
        val acts = snap.optJSONArray("activities") ?: return
        for (i in 0 until acts.length()) {
            val o = acts.optJSONObject(i) ?: continue
            if (o.optString("id") == activityId) {
                o.put("status", status)
                break
            }
        }
        WidgetStore.writeSnapshot(ctx, snap.toString())
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private fun runOnIo(block: () -> Unit) {
        Thread(block, "DayFlowWidgetAction").apply { isDaemon = true }.start()
    }
}
