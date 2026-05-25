package com.chanclastudio.dayflow.summary

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bridge between the Next.js layer and the daily-summary tray entry.
 *
 * JS surface (see lib/daily-summary.ts):
 *   setEnabled({ enabled })  — flip the user's toggle (also persists locally)
 *   refresh()                — re-post with the current widget snapshot
 *   cancel()                 — clear the tray entry (e.g. user toggled off)
 *   isEnabled()              → { enabled: boolean }
 */
@CapacitorPlugin(name = "DailySummary")
class DailySummaryPlugin : Plugin() {

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: run {
            call.reject("Missing 'enabled'"); return
        }
        DailySummaryNotifier.setEnabled(context, enabled)
        if (enabled) {
            DailySummaryReceiver.scheduleNextMidnight(context)
        } else {
            DailySummaryReceiver.cancelMidnight(context)
        }
        call.resolve()
    }

    @PluginMethod
    fun refresh(call: PluginCall) {
        DailySummaryNotifier.post(context)
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        DailySummaryNotifier.cancel(context)
        call.resolve()
    }

    @PluginMethod
    fun isEnabled(call: PluginCall) {
        val result = JSObject().apply {
            put("enabled", DailySummaryNotifier.isEnabled(context))
        }
        call.resolve(result)
    }
}
