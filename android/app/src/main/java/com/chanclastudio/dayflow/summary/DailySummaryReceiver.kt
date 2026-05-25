package com.chanclastudio.dayflow.summary

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.Calendar

/**
 * Re-posts the always-pinned daily summary on:
 *   - device boot (BOOT_COMPLETED) — the OS clears tray entries on reboot,
 *     this gets DayFlow's summary back without waiting for the user to open
 *     the app.
 *   - midnight (ACTION_MIDNIGHT_TICK)   — the date label and "N events
 *     today" body need to roll over at 00:00 local. Without this the
 *     notification would still say "Mon, May 25 · 3 events today" all day
 *     Tuesday until something else re-rendered it.
 *
 * Both paths short-circuit when the user has the toggle off (the notifier
 * checks isEnabled internally).
 */
class DailySummaryReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context, intent: Intent) {
        DailySummaryNotifier.post(ctx)
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == ACTION_MIDNIGHT_TICK) {
            scheduleNextMidnight(ctx)
        }
    }

    companion object {
        const val ACTION_MIDNIGHT_TICK = "com.chanclastudio.dayflow.SUMMARY_MIDNIGHT"

        /** Schedules the next 00:00 local-time wake-up. Uses inexact alarms
         *  (no SCHEDULE_EXACT_ALARM needed) — a few minutes of drift around
         *  midnight is invisible for a tray summary. */
        fun scheduleNextMidnight(ctx: Context) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val next = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 1)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            am.set(AlarmManager.RTC, next.timeInMillis, tickIntent(ctx))
        }

        fun cancelMidnight(ctx: Context) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            am.cancel(tickIntent(ctx))
        }

        private fun tickIntent(ctx: Context): PendingIntent {
            val intent = Intent(ctx, DailySummaryReceiver::class.java).apply {
                action = ACTION_MIDNIGHT_TICK
            }
            return PendingIntent.getBroadcast(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
    }
}
