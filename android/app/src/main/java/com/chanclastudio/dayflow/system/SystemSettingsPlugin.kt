package com.chanclastudio.dayflow.system

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Opens Android system settings pages from the WebView. Used by the
 * Notification & Reminders troubleshoot page so the user can tap a row
 * and land directly in the right OS settings screen instead of being
 * told to "go to Settings > Apps > DayFlow > ..." in plain text.
 *
 * JS surface (see lib/system-settings.ts):
 *   openAppNotificationSettings()         → opens this app's notification settings
 *   openBatteryOptimizationSettings()     → opens battery-optimization settings
 *   openAutoStartSettings()               → best-effort: opens manufacturer-specific auto-start
 *                                           page if known, else app details
 *   checkBatteryOptimization() → { ignoring: boolean }
 *   checkNotificationsEnabled() → { enabled: boolean }
 */
@CapacitorPlugin(name = "SystemSettings")
class SystemSettingsPlugin : Plugin() {

    @PluginMethod
    fun openAppNotificationSettings(call: PluginCall) {
        val ctx = context
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
            }
        } else {
            // Pre-Android 8: fall back to the app's details screen.
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", ctx.packageName, null)
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(intent)
            call.resolve()
        } catch (e: Throwable) {
            call.reject("Could not open notification settings: ${e.message}")
        }
    }

    @PluginMethod
    fun openBatteryOptimizationSettings(call: PluginCall) {
        val ctx = context
        // Prefer the request-exemption screen pre-filtered to this app; fall
        // back to the global list, then to app details if both are unavailable.
        val intents = mutableListOf<Intent>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intents += Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        }
        intents += Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", ctx.packageName, null)
        }
        for (i in intents) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(i)
                call.resolve(); return
            } catch (_: Throwable) { /* try next */ }
        }
        call.reject("No settings activity available")
    }

    /**
     * Auto-start (also called "background restrictions") is manufacturer
     * specific — Xiaomi, Huawei, Oppo, Vivo each ship a different screen.
     * We try the known component names in order, then fall back to app
     * details. The user still has to find the toggle themselves on some
     * skins, but we at least land them in a relevant area.
     */
    @PluginMethod
    fun openAutoStartSettings(call: PluginCall) {
        val ctx = context
        val candidates = listOf(
            // (package, class)
            "com.miui.securitycenter"          to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.letv.android.letvsafe"        to "com.letv.android.letvsafe.AutobootManageActivity",
            "com.huawei.systemmanager"         to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager"         to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            "com.coloros.safecenter"           to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter"           to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.iqoo.secure"                  to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            "com.vivo.permissionmanager"       to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.asus.mobilemanager"           to "com.asus.mobilemanager.entry.FunctionActivity",
            "com.samsung.android.lool"         to "com.samsung.android.sm.ui.battery.BatteryActivity",
            "com.oneplus.security"             to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
        )
        for ((pkg, cls) in candidates) {
            val intent = Intent().apply {
                component = android.content.ComponentName(pkg, cls)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                ctx.startActivity(intent)
                call.resolve(); return
            } catch (_: Throwable) { /* try next */ }
        }
        // Stock Android / unknown OEM: just open the app details. The user
        // can navigate to "Battery" → "Allow background activity" from here.
        try {
            val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", ctx.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(fallback)
            call.resolve()
        } catch (e: Throwable) {
            call.reject("No auto-start settings available")
        }
    }

    @PluginMethod
    fun checkBatteryOptimization(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            // Pre-Marshmallow had no Doze, so technically nothing to be
            // optimized out of — report ignoring=true so the UI doesn't
            // surface a warning.
            result.put("ignoring", true)
            call.resolve(result); return
        }
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val ignoring = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        result.put("ignoring", ignoring)
        call.resolve(result)
    }

    @PluginMethod
    fun checkNotificationsEnabled(call: PluginCall) {
        val result = JSObject()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val enabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            nm?.areNotificationsEnabled() ?: false
        } else true
        result.put("enabled", enabled)
        call.resolve(result)
    }
}
