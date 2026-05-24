package com.chanclastudio.dayflow.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Single entry point for all widget user actions. Dispatches by action string.
 *  - ACTION_ROW_CLICK  → toggle done status of the activity in the extras
 */
class WidgetActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ROW_CLICK = "com.chanclastudio.dayflow.widget.ROW_CLICK"

        const val EXTRA_ACTIVITY_ID    = "activity_id"
        const val EXTRA_CURRENTLY_DONE = "currently_done"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            ACTION_ROW_CLICK -> handleRowClick(ctx, intent)
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

        // Optimistic local update so the Today widget redraws instantly. Only
        // touches the activities array — Streak/NextUp catch up after the
        // post-PATCH sync below, which is fast enough that a one-second lag on
        // those tiles is acceptable for the perceived snappiness on Today.
        optimisticUpdate(ctx, id, newStatus)
        mainHandler.post { TodayWidgetProvider.renderAll(ctx) }

        runOnIo {
            SupabaseRest.updateStatus(ctx, id, newStatus)
            // Rebuild the full snapshot from truth, even if the PATCH failed —
            // the fetch returns the unchanged row so the optimistic update
            // gets reverted and the user can't get stuck in a wrong state.
            // refresh() handles the render fan-out for all three providers.
            WidgetSnapshotSync.refresh(ctx)
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
