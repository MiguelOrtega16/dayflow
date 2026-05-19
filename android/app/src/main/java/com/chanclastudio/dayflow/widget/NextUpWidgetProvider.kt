package com.chanclastudio.dayflow.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.util.Log
import android.widget.RemoteViews
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * NextUp widget — 4x1 strip showing the soonest upcoming activity and a
 * countdown. The countdown is recomputed every minute via an AlarmManager
 * tick (the OS-managed updatePeriodMillis floors at 30 min, which would
 * make the countdown stale).
 */
class NextUpWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            try { renderWidget(ctx, mgr, id) }
            catch (t: Throwable) { Log.e("DayFlowWidget", "nextup render failed id=$id", t) }
        }
        scheduleNextTick(ctx)
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: android.os.Bundle?
    ) { renderWidget(ctx, mgr, id) }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        ids.forEach { WidgetStore.clearConfig(ctx, it) }
        // If no NextUp widgets remain, stop the per-minute tick.
        val mgr = AppWidgetManager.getInstance(ctx)
        val cmp = ComponentName(ctx, NextUpWidgetProvider::class.java)
        if (mgr.getAppWidgetIds(cmp).isEmpty()) cancelTick(ctx)
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == ACTION_TICK) {
            renderAll(ctx)
            scheduleNextTick(ctx)
        }
    }

    companion object {
        private const val ACTION_TICK = "com.chanclastudio.dayflow.NEXTUP_TICK"

        fun renderAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val cmp = ComponentName(ctx, NextUpWidgetProvider::class.java)
            mgr.getAppWidgetIds(cmp).forEach { renderWidget(ctx, mgr, it) }
        }

        private fun tickIntent(ctx: Context): PendingIntent {
            val intent = Intent(ctx, NextUpWidgetProvider::class.java).apply {
                action = ACTION_TICK
            }
            return PendingIntent.getBroadcast(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        /** Schedules the next tick at the top of the next minute. */
        private fun scheduleNextTick(ctx: Context) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val now = System.currentTimeMillis()
            val msUntilNextMinute = 60_000 - (now % 60_000)
            // setExact would be more accurate but requires SCHEDULE_EXACT_ALARM
            // on API 31+. Inexact is fine — a few-seconds drift is invisible
            // for "in 32 min" style countdowns.
            am.set(AlarmManager.RTC, now + msUntilNextMinute, tickIntent(ctx))
        }

        private fun cancelTick(ctx: Context) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            am.cancel(tickIntent(ctx))
        }

        private fun renderWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.nextup_widget)

            // ── Apply per-widget config (background tint + opacity) ──
            val colorHex   = WidgetStore.readColor(ctx, widgetId)
            val opacityPct = WidgetStore.readOpacity(ctx, widgetId)
            val baseColor  = parseHex(colorHex, fallback = 0xFF7C6FE3.toInt())
            val alpha      = (opacityPct.coerceIn(20, 100) * 255 / 100)
            val bgColor    = (alpha shl 24) or (baseColor and 0x00FFFFFF)
            views.setInt(R.id.nextup_bg, "setBackgroundColor", bgColor)

            val next = WidgetStore.readNextActivity(ctx)

            if (next == null) {
                views.setTextViewText(R.id.nextup_when, "PRÓXIMA")
                views.setTextViewText(R.id.nextup_title, "Sin actividades próximas")
                views.setTextViewText(R.id.nextup_countdown, "")
            } else {
                val label = (next.emoji?.let { "$it  " } ?: "") + next.title
                views.setTextViewText(R.id.nextup_title, label)
                val (whenLabel, countdown) = whenAndCountdown(next.date, next.startTime)
                views.setTextViewText(R.id.nextup_when, whenLabel.uppercase())
                views.setTextViewText(R.id.nextup_countdown, countdown)
            }

            // Tap → open the app on the day the activity is scheduled. If
            // there is no next activity, fall back to today's dashboard.
            val gotoPath = if (next != null) "/dashboard?date=${next.date}" else "/dashboard"
            val openIntent = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("dayflow:gotoPath", gotoPath)
            }
            views.setOnClickPendingIntent(
                R.id.nextup_bg,
                PendingIntent.getActivity(
                    ctx, widgetId * 100,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )

            mgr.updateAppWidget(widgetId, views)
        }

        /** Returns ("PRÓXIMA" | "HOY" | "MAÑANA" | "EN N DÍAS", countdown). */
        private fun whenAndCountdown(dateStr: String, timeStr: String): Pair<String, String> {
            return try {
                val df = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply {
                    timeZone = TimeZone.getDefault()
                }
                // Accept "HH:mm" or "HH:mm:ss"
                val t = if (timeStr.length >= 5) timeStr.substring(0, 5) else timeStr
                val target = df.parse("$dateStr $t") ?: return Pair("PRÓXIMA", "")
                val now    = Date()
                val deltaMs = target.time - now.time

                val todayCal  = Calendar.getInstance().apply { time = now }
                val targetCal = Calendar.getInstance().apply { time = target }
                val sameDay   = todayCal.get(Calendar.YEAR) == targetCal.get(Calendar.YEAR) &&
                                todayCal.get(Calendar.DAY_OF_YEAR) == targetCal.get(Calendar.DAY_OF_YEAR)
                val tomorrowCal = (todayCal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }
                val isTomorrow  = tomorrowCal.get(Calendar.YEAR) == targetCal.get(Calendar.YEAR) &&
                                  tomorrowCal.get(Calendar.DAY_OF_YEAR) == targetCal.get(Calendar.DAY_OF_YEAR)

                val whenLabel = when {
                    sameDay    -> "Hoy"
                    isTomorrow -> "Mañana"
                    else       -> {
                        val days = ((target.time - now.time) / 86_400_000L).toInt() + 1
                        "En $days días"
                    }
                }

                val countdown = formatCountdown(deltaMs, target)
                Pair(whenLabel, countdown)
            } catch (e: Throwable) {
                Pair("PRÓXIMA", "")
            }
        }

        private fun parseHex(hex: String?, fallback: Int): Int = try {
            if (hex.isNullOrBlank()) fallback else Color.parseColor(hex)
        } catch (_: Throwable) { fallback }

        private fun formatCountdown(deltaMs: Long, target: Date): String {
            if (deltaMs <= 0) return "Iniciando…"
            val minutes = deltaMs / 60_000L
            val hours   = minutes / 60
            val timeFmt = SimpleDateFormat("h:mm a", Locale.US).format(target)
            return when {
                minutes < 1   -> "Empieza en menos de 1 min · $timeFmt"
                minutes < 60  -> "Empieza en $minutes min · $timeFmt"
                minutes < 1440 -> "Empieza en ${hours} h · $timeFmt"
                else           -> "A las $timeFmt"
            }
        }
    }
}
