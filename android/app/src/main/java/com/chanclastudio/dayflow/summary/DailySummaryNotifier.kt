package com.chanclastudio.dayflow.summary

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R
import com.chanclastudio.dayflow.widget.WidgetStore
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Builds and posts the always-pinned "today summary" notification:
 *   - title: today's date ("Mon, May 25")
 *   - body : count of activities for today, or "No event today"
 *   - actions: + Task / + Reminder, both deep-link into the create modal
 *
 * The notification is dismissible (the user can swipe it away) but
 * tapping either action button does NOT auto-cancel it — only an
 * explicit dismiss removes it. Re-posting with the same id replaces
 * the previous one in place.
 *
 * Data comes from the same WidgetStore snapshot the home-screen widgets
 * read, so no extra network round-trip is needed.
 */
object DailySummaryNotifier {
    /** Stable id so post-and-refresh replaces the same tray entry instead
     *  of stacking new ones every time the app re-renders. */
    const val NOTIFICATION_ID = 9_111_001

    /** Channel id for the persistent summary. Separate from the activity-
     *  reminders channel so users can mute one without touching the other. */
    const val CHANNEL_ID = "daily-summary"

    /** SharedPreferences key — JS sets this whenever the user toggles the
     *  Settings switch; the boot receiver consults it before re-posting. */
    private const val PREFS_NAME = "dayflow_daily_summary"
    private const val K_ENABLED  = "enabled"

    fun setEnabled(ctx: Context, enabled: Boolean) {
        ctx.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(K_ENABLED, enabled).apply()
        if (enabled) post(ctx) else cancel(ctx)
    }

    fun isEnabled(ctx: Context): Boolean =
        ctx.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(K_ENABLED, true) // default on — matches the user pref default

    /** Builds & posts (or refreshes) the notification. Safe to call from any
     *  thread. No-ops when the user has disabled it or notification permission
     *  is missing. */
    fun post(ctx: Context) {
        val app = ctx.applicationContext
        if (!isEnabled(app)) return
        ensureChannel(app)

        // ── Read today's count from the widget snapshot. We deliberately
        //    don't go to the network here — the widget snapshot is the
        //    single source of truth, and the snapshot's own refresh path
        //    already keeps the data fresh from JS + widget renders. ──
        val acts = WidgetStore.readActivities(app)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = TimeZone.getDefault()
        }.format(Date())
        var todayCount = 0
        for (i in 0 until acts.length()) {
            val o = acts.optJSONObject(i) ?: continue
            if (o.optString("date") == today) todayCount++
        }

        val headerFmt = SimpleDateFormat("EEE, MMM d", Locale.getDefault()).apply {
            timeZone = TimeZone.getDefault()
        }
        val title = headerFmt.format(Date())
            .replaceFirstChar { it.titlecase(Locale.getDefault()) }
        val body = when (todayCount) {
            0    -> app.getString(R.string.daily_summary_body_zero)
            1    -> app.getString(R.string.daily_summary_body_one)
            else -> app.getString(R.string.daily_summary_body_many, todayCount)
        }

        // ── Content tap → open the dashboard at today (no auto-cancel, see
        //    setAutoCancel(false) below — the notification stays). ──
        val openIntent = Intent(app, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("dayflow:gotoPath", "/dashboard?date=$today")
        }
        val openPi = PendingIntent.getActivity(
            app, REQ_OPEN, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // ── Actions: + Task / + Reminder. The create modal reads ?type= to
        //    pre-select the activity category. ──
        val taskIntent = Intent(app, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("dayflow:gotoPath", "/dashboard?create=today&type=task")
        }
        val taskPi = PendingIntent.getActivity(
            app, REQ_TASK, taskIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val reminderIntent = Intent(app, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("dayflow:gotoPath", "/dashboard?create=today&type=reminder")
        }
        val reminderPi = PendingIntent.getActivity(
            app, REQ_REMINDER, reminderIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // ── Custom RemoteViews so both + buttons stay visible without the
        //    user having to expand the notification. Standard addAction
        //    buttons render in the *expanded* state on most launchers
        //    (Samsung One UI in particular hides them until the user taps
        //    the chevron). A custom content view with two click-attached
        //    TextViews mirrors what the screenshot reference does — see
        //    layout/daily_summary_notification.xml. ──
        val taskLabel     = app.getString(R.string.daily_summary_action_task)
        val reminderLabel = app.getString(R.string.daily_summary_action_reminder)
        val contentView   = RemoteViews(app.packageName, R.layout.daily_summary_notification).apply {
            setTextViewText(R.id.summary_title,        title)
            setTextViewText(R.id.summary_body,         body)
            setTextViewText(R.id.summary_btn_task,     taskLabel)
            setTextViewText(R.id.summary_btn_reminder, reminderLabel)
            setOnClickPendingIntent(R.id.summary_btn_task,     taskPi)
            setOnClickPendingIntent(R.id.summary_btn_reminder, reminderPi)
        }

        val builder = NotificationCompat.Builder(app, CHANNEL_ID)
            // Re-using the launcher icon as the small icon — Android requires
            // a monochrome silhouette here; the standard launcher fills that
            // role across all DayFlow surfaces (same as the FCM default icon).
            .setSmallIcon(R.mipmap.ic_launcher)
            // setContentTitle / setContentText are still set as a fallback
            // for accessibility services and for OEMs that ignore custom
            // views — the visible UI is owned by the RemoteViews above.
            .setContentTitle(title)
            .setContentText(body)
            .setColor(0xFF7C6FE3.toInt())
            .setContentIntent(openPi)
            // DecoratedCustomViewStyle draws the standard notification
            // chrome (icon + app name + time + chevron) around our custom
            // layout — same content view is used in collapsed + expanded
            // mode so the two action TextViews are always on screen.
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(contentView)
            .setCustomBigContentView(contentView)
            // No auto-cancel: tapping the body keeps the tray entry alive so
            // the user always has the running summary to come back to. Action
            // buttons don't auto-cancel either (Android default behavior).
            .setAutoCancel(false)
            // Not "ongoing": ongoing notifications cannot be swiped away by
            // the user, which contradicts the explicit ask ("clicking ... +
            // buttons should not remove the notification unless it's
            // dismissed"). Dismissible + sticky-id is the right balance.
            .setOngoing(false)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        // Avoid the system "Notification posted" toast / sound on refresh —
        // the only time this fires real audio is the first ever post on a
        // brand-new channel install (Android plays one set-up chime there).
        try {
            NotificationManagerCompat.from(app)
                .notify(NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS not granted on Android 13+. Silent no-op —
            // the JS layer requests this permission via the local-notifications
            // plugin; if the user denied it the tray entry simply doesn't
            // appear until they re-grant.
        }
    }

    fun cancel(ctx: Context) {
        NotificationManagerCompat.from(ctx.applicationContext).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            ctx.getString(R.string.daily_summary_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = ctx.getString(R.string.daily_summary_channel_description)
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
            lightColor = Color.parseColor("#7C6FE3")
        }
        nm.createNotificationChannel(channel)
    }

    // Distinct request codes so the four PendingIntents don't collapse into
    // the same cached intent (Android dedupes by requestCode + filterEquals).
    private const val REQ_OPEN     = 1
    private const val REQ_TASK     = 2
    private const val REQ_REMINDER = 3
}
