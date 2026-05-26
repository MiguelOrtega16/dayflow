package com.chanclastudio.dayflow.deeplink

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * JS surface for [DeepLinkStore]. The dashboard shell calls
 * `consumePending()` once on mount; if a path comes back, it does a
 * full window.location.href navigation so every useEffect downstream
 * (calendar-view's ?create=… reader, etc.) fires fresh.
 *
 *   consumePending() → { path: string | null }
 */
@CapacitorPlugin(name = "DeepLink")
class DeepLinkPlugin : Plugin() {
    @PluginMethod
    fun consumePending(call: PluginCall) {
        val result = JSObject().apply {
            put("path", DeepLinkStore.consumePending(context))
        }
        call.resolve(result)
    }
}
