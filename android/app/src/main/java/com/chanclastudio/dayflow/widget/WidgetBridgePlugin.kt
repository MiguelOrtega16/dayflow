package com.chanclastudio.dayflow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * Bridge between the Next.js layer and the Android home-screen widget.
 *
 * JS surface (see lib/widget-bridge.ts):
 *   writeSnapshot({ json })             — caches activities for the widget
 *   writeAuth({ supabaseUrl, anonKey, accessToken, refreshToken, expiresAt, userId })
 *   writeConfig({ widgetId, color, opacity })
 *   readConfig({ widgetId }) → { color, opacity }
 *   listWidgetIds() → { ids: number[] }
 *   requestPin()    → { supported: boolean, requested: boolean }
 *   clearAuth()
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun writeSnapshot(call: PluginCall) {
        val json = call.getString("json") ?: run {
            call.reject("Missing json"); return
        }
        WidgetStore.writeSnapshot(context, json)
        TodayWidgetProvider.renderAll(context)
        call.resolve()
    }

    @PluginMethod
    fun writeAuth(call: PluginCall) {
        try {
            val auth = WidgetStore.Auth(
                supabaseUrl  = call.getString("supabaseUrl")  ?: error("supabaseUrl"),
                anonKey      = call.getString("anonKey")      ?: error("anonKey"),
                accessToken  = call.getString("accessToken")  ?: error("accessToken"),
                refreshToken = call.getString("refreshToken") ?: error("refreshToken"),
                // Capacitor serializes JS numbers inconsistently across versions —
                // sometimes Long, sometimes Int, sometimes Double. Walk through
                // each typed accessor so the bridge call doesn't fail just
                // because a 10-digit epoch landed as a Double on this version.
                expiresAt    = call.longLikeOrNull("expiresAt") ?: error("expiresAt"),
                userId       = call.getString("userId")       ?: error("userId"),
            )
            WidgetStore.writeAuth(context, auth)
            Log.d("DayFlowWidget", "writeAuth OK userId=${auth.userId} expiresAt=${auth.expiresAt}")
            call.resolve()
        } catch (t: Throwable) {
            Log.w("DayFlowWidget", "writeAuth failed — ${t.message}")
            call.reject("Missing field: ${t.message}")
        }
    }

    /** Capacitor-version-agnostic number→Long coercion. */
    private fun PluginCall.longLikeOrNull(key: String): Long? {
        getLong(key)?.let { return it }
        getInt(key)?.let { return it.toLong() }
        getDouble(key)?.let { return it.toLong() }
        return getString(key)?.toLongOrNull()
    }

    @PluginMethod
    fun clearAuth(call: PluginCall) {
        WidgetStore.clearAuth(context)
        call.resolve()
    }

    @PluginMethod
    fun writeConfig(call: PluginCall) {
        val widgetId = call.getInt("widgetId") ?: run { call.reject("Missing widgetId"); return }
        val color    = call.getString("color")  ?: "#7C6FE3"
        val opacity  = call.getInt("opacity")   ?: 95
        WidgetStore.writeConfig(context, widgetId, color, opacity)
        TodayWidgetProvider.renderAll(context)
        call.resolve()
    }

    @PluginMethod
    fun readConfig(call: PluginCall) {
        val widgetId = call.getInt("widgetId") ?: run { call.reject("Missing widgetId"); return }
        val result = com.getcapacitor.JSObject().apply {
            put("color",   WidgetStore.readColor(context, widgetId))
            put("opacity", WidgetStore.readOpacity(context, widgetId))
        }
        call.resolve(result)
    }

    @PluginMethod
    fun listWidgetIds(call: PluginCall) {
        val mgr = AppWidgetManager.getInstance(context)
        val cmp = ComponentName(context, TodayWidgetProvider::class.java)
        val ids = mgr.getAppWidgetIds(cmp)
        val result = com.getcapacitor.JSObject().apply {
            val arr = JSArray()
            ids.forEach { arr.put(it) }
            put("ids", arr)
        }
        call.resolve(result)
    }

    /**
     * Programmatic widget pinning (Android 8+). Falls back to "open the
     * launcher's widget tray" instructions on older devices or launchers
     * that don't support pinning.
     */
    @PluginMethod
    fun requestPin(call: PluginCall) {
        val result = com.getcapacitor.JSObject()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.put("supported", false)
            result.put("requested", false)
            call.resolve(result); return
        }
        val mgr = AppWidgetManager.getInstance(context)
        if (!mgr.isRequestPinAppWidgetSupported) {
            result.put("supported", false)
            result.put("requested", false)
            call.resolve(result); return
        }
        val cmp = ComponentName(context, TodayWidgetProvider::class.java)
        val successCallback = PendingIntent.getBroadcast(
            context, 0,
            Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_REFRESH
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val ok = mgr.requestPinAppWidget(cmp, null, successCallback)
        result.put("supported", true)
        result.put("requested", ok)
        call.resolve(result)
    }
}
