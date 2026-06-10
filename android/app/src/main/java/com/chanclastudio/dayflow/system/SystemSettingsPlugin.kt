package com.chanclastudio.dayflow.system

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
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

    /** Currently-playing settings-screen sound preview, kept so a new preview
     *  can stop the previous one. */
    private var previewRingtone: Ringtone? = null

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
            // Samsung's "Never sleeping apps" screen — preferred entry on
            // Samsung devices so the user lands directly on the add-to-list
            // surface instead of the generic Battery overview. Activity class
            // names differ slightly across One UI versions, so try the known
            // variants top-down.
            "com.samsung.android.lool"         to "com.samsung.android.sm.battery.ui.NeverSleepingAppsActivity",
            "com.samsung.android.lool"         to "com.samsung.android.sm.battery.ui.BackgroundUsageLimitsActivity",
            "com.samsung.android.lool"         to "com.samsung.android.sm.ui.battery.BatteryActivity",
            "com.miui.securitycenter"          to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.letv.android.letvsafe"        to "com.letv.android.letvsafe.AutobootManageActivity",
            "com.huawei.systemmanager"         to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager"         to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            "com.coloros.safecenter"           to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter"           to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.iqoo.secure"                  to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            "com.vivo.permissionmanager"       to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.asus.mobilemanager"           to "com.asus.mobilemanager.entry.FunctionActivity",
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

    /**
     * Creates the alarm-type notification channel with a distinctive long
     * vibration pattern. Capacitor's LocalNotifications.createChannel
     * exposes a `vibration: boolean` toggle but no way to set the actual
     * pattern, which is why this lives in native code.
     *
     * The channel is named/described by the caller (so we don't hardcode
     * Spanish strings here). Idempotent — calling repeatedly is fine.
     *
     * Note: Android channels are immutable after creation. Once the user
     * has this channel installed with a given pattern, changing the
     * pattern in code does nothing for that user. Use a versioned id
     * (e.g. ...-v2) when you actually need to evolve the channel.
     */
    @PluginMethod
    fun createAlarmChannel(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // Pre-Android 8 has no channels — caller falls back to per-
            // notification settings.
            call.resolve(); return
        }
        val id          = call.getString("id")          ?: run { call.reject("Missing id"); return }
        val name        = call.getString("name")        ?: id
        val description = call.getString("description") ?: ""
        // Optional res/raw sound (no extension). Blank/null = system default
        // notification sound, preserving the original alarm-channel behavior.
        val sound       = call.getString("sound")

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (nm == null) { call.reject("No NotificationManager"); return }

        val soundUri: Uri = if (!sound.isNullOrBlank()) {
            val resId = context.resources.getIdentifier(sound, "raw", context.packageName)
            if (resId != 0) Uri.parse("android.resource://${context.packageName}/$resId")
            else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        }

        try {
            val channel = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                this.description = description
                enableVibration(true)
                // Triple-pulse + long buzz. Total ~3.4s. Distinct from the
                // default short single-buzz used by IMPORTANCE_HIGH/MAX
                // without a custom pattern.
                vibrationPattern = longArrayOf(0, 700, 250, 700, 250, 700, 250, 1200)
                enableLights(true)
                setSound(
                    soundUri,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
            }
            nm.createNotificationChannel(channel)
            call.resolve()
        } catch (e: Throwable) {
            call.reject("createAlarmChannel failed: ${e.message}")
        }
    }

    /**
     * Creates a standard reminder channel that plays a bundled custom sound
     * from res/raw. Used by the "Notification sound" setting: each selectable
     * sound gets its own channel (a channel's sound is immutable once created,
     * so the only way to switch sounds is to switch channels). The FCM server
     * routes a push to the right channel via channel_id — see
     * lib/notification-sounds.ts which owns the id↔sound mapping.
     *
     * `sound` is a raw resource name WITHOUT extension (e.g. "notif_ding").
     * If it's null/blank, we fall back to the system default notification
     * sound. Importance + vibration mirror the 'activity-reminders' channel so
     * a custom-sound reminder behaves identically apart from the audio.
     * Idempotent — re-calling with the same id is a no-op on Android.
     */
    @PluginMethod
    fun createReminderChannel(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.resolve(); return }
        val id          = call.getString("id")          ?: run { call.reject("Missing id"); return }
        val name        = call.getString("name")        ?: id
        val description = call.getString("description") ?: ""
        val sound       = call.getString("sound")

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (nm == null) { call.reject("No NotificationManager"); return }

        val soundUri: Uri = if (!sound.isNullOrBlank()) {
            val resId = context.resources.getIdentifier(sound, "raw", context.packageName)
            if (resId != 0) Uri.parse("android.resource://${context.packageName}/$resId")
            else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        }

        try {
            val channel = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                this.description = description
                enableVibration(true)
                enableLights(true)
                setSound(
                    soundUri,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
            }
            nm.createNotificationChannel(channel)
            call.resolve()
        } catch (e: Throwable) {
            call.reject("createReminderChannel failed: ${e.message}")
        }
    }

    /**
     * Plays a one-off preview of a bundled sound through the NOTIFICATION audio
     * stream/usage (not the media stream), so the settings preview matches the
     * loudness the user will actually hear for a notification. `sound` is a
     * res/raw resource name without extension (e.g. "notif_ding"); null/blank
     * previews the system default notification tone. A new call stops any
     * still-playing preview.
     */
    @PluginMethod
    fun previewSound(call: PluginCall) {
        val sound = call.getString("sound")
        val uri: Uri = if (!sound.isNullOrBlank()) {
            val resId = context.resources.getIdentifier(sound, "raw", context.packageName)
            if (resId != 0) Uri.parse("android.resource://${context.packageName}/$resId")
            else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        }
        try {
            previewRingtone?.stop()
            val rt = RingtoneManager.getRingtone(context, uri)
                ?: run { call.reject("No ringtone for uri"); return }
            rt.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            rt.play()
            previewRingtone = rt
            call.resolve()
        } catch (e: Throwable) {
            call.reject("previewSound failed: ${e.message}")
        }
    }

    /** Deletes a notification channel by id. Safe to call on a channel
     *  that doesn't exist. */
    @PluginMethod
    fun deleteChannel(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.resolve(); return }
        val id = call.getString("id") ?: run { call.reject("Missing id"); return }
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        try {
            nm?.deleteNotificationChannel(id)
            call.resolve()
        } catch (e: Throwable) {
            call.reject("deleteChannel failed: ${e.message}")
        }
    }
}
