package com.chanclastudio.dayflow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Day widget — 4×2 tile showing today's date (big number + month/weekday)
 * and up to 4 of the day's activities. Tap → opens the calendar's Day view
 * for the specific activity (or the day itself if none is tapped). Pulls
 * from the shared widget snapshot, just like Today/Streak/NextUp.
 */
class DayWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            try { renderWidget(ctx, mgr, id) }
            catch (t: Throwable) { Log.e("DayFlowWidget", "day render failed id=$id", t) }
        }
        // Self-refresh on placement + ~30 min periodic onUpdate so a freshly
        // placed widget pulls live data without waiting for the app to open.
        WidgetSnapshotSync.refreshIfStale(ctx)
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: android.os.Bundle?
    ) { renderWidget(ctx, mgr, id) }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        ids.forEach { WidgetStore.clearConfig(ctx, it) }
    }

    companion object {
        // Distinct dot palette so each row visibly differs even when the
        // underlying activities all share the same category colour. Order
        // is stable so the same activity keeps the same colour between
        // renders.
        private val ROW_COLORS = intArrayOf(
            0xFF22C55E.toInt(),   // green
            0xFFF59E0B.toInt(),   // amber
            0xFFA855F7.toInt(),   // purple
            0xFF0EA5E9.toInt(),   // sky
        )

        fun renderAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val cmp = ComponentName(ctx, DayWidgetProvider::class.java)
            mgr.getAppWidgetIds(cmp).forEach { renderWidget(ctx, mgr, it) }
        }

        private fun renderWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.day_widget)

            // ── Apply per-widget config (background tint + opacity) ──
            val colorHex   = WidgetStore.readColor(ctx, widgetId)
            val opacityPct = WidgetStore.readOpacity(ctx, widgetId)
            val baseColor  = parseHex(colorHex, fallback = 0xFF171818.toInt())
            val alpha      = (opacityPct.coerceIn(20, 100) * 255 / 100)
            val bgColor    = (alpha shl 24) or (baseColor and 0x00FFFFFF)
            views.setInt(R.id.day_bg, "setBackgroundColor", bgColor)

            // ── Header: big date ──
            val today = Date()
            val numFmt   = SimpleDateFormat("d",       Locale.getDefault()).apply { timeZone = TimeZone.getDefault() }
            val subFmt   = SimpleDateFormat("MMM, EEE", Locale.getDefault()).apply { timeZone = TimeZone.getDefault() }
            views.setTextViewText(R.id.day_big_num, numFmt.format(today))
            views.setTextViewText(R.id.day_big_sub, subFmt.format(today).replaceFirstChar { it.titlecase(Locale.getDefault()) })

            // ── Activities for today, sorted by start_time (nulls last) ──
            val activities = WidgetStore.readActivities(ctx)
            val todayStr   = SupabaseRest.todayStr()
            data class Item(val id: String, val title: String, val sub: String, val sortKey: String)
            val items = mutableListOf<Item>()
            for (i in 0 until activities.length()) {
                val o = activities.optJSONObject(i) ?: continue
                if (o.optString("date") != todayStr) continue
                if (o.optString("status") == "done") continue
                val emoji = o.optString("emoji").takeIf { it.isNotBlank() && it != "null" }
                val title = (if (emoji != null) "$emoji  " else "") + o.optString("title", "")
                val start = o.optString("start_time").takeIf { it.isNotBlank() && it != "null" }
                val end   = o.optString("end_time").takeIf { it.isNotBlank() && it != "null" }
                val sub = when {
                    start == null            -> "TODO EL DÍA"
                    end != null              -> "${fmtTime(start)} - ${fmtTime(end)}"
                    else                     -> fmtTime(start)
                }
                items += Item(
                    id      = o.optString("id"),
                    title   = title.trim(),
                    sub     = sub,
                    // Sort: timed activities first by start, all-day last.
                    sortKey = start ?: "99:99",
                )
            }
            items.sortBy { it.sortKey }

            val rowIds = listOf(
                Triple(R.id.day_row_1, R.id.day_row_1_title, R.id.day_row_1_sub),
                Triple(R.id.day_row_2, R.id.day_row_2_title, R.id.day_row_2_sub),
                Triple(R.id.day_row_3, R.id.day_row_3_title, R.id.day_row_3_sub),
                Triple(R.id.day_row_4, R.id.day_row_4_title, R.id.day_row_4_sub),
            )
            val dotIds = intArrayOf(R.id.day_row_1_dot, R.id.day_row_2_dot, R.id.day_row_3_dot, R.id.day_row_4_dot)

            // Show the populated rows, hide the rest.
            for (i in rowIds.indices) {
                val (rowId, titleId, subId) = rowIds[i]
                val it = items.getOrNull(i)
                if (it == null) {
                    views.setViewVisibility(rowId, View.GONE)
                } else {
                    views.setViewVisibility(rowId, View.VISIBLE)
                    views.setTextViewText(titleId, it.title)
                    views.setTextViewText(subId, it.sub)
                    views.setInt(dotIds[i], "setBackgroundColor", ROW_COLORS[i % ROW_COLORS.size])

                    // Tap on the row → open the Day view at today with this
                    // activity opened (so the user lands on the time-grid
                    // entry that matches what they tapped).
                    val openIntent = Intent(ctx, MainActivity::class.java).apply {
                        action = Intent.ACTION_VIEW
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        putExtra(
                            "dayflow:gotoPath",
                            "/dashboard?view=day&date=$todayStr&activity=${Uri.encode(it.id)}",
                        )
                    }
                    views.setOnClickPendingIntent(
                        rowId,
                        PendingIntent.getActivity(
                            ctx, widgetId * 100 + i + 1,
                            openIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                        ),
                    )
                }
            }

            // Empty state when there's nothing for today.
            views.setViewVisibility(R.id.day_empty, if (items.isEmpty()) View.VISIBLE else View.GONE)

            // Header (big-date cluster) → open the Day view for today.
            val headerIntent = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("dayflow:gotoPath", "/dashboard?view=day&date=$todayStr")
            }
            views.setOnClickPendingIntent(
                R.id.day_header,
                PendingIntent.getActivity(
                    ctx, widgetId * 100,
                    headerIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            mgr.updateAppWidget(widgetId, views)
        }

        private fun fmtTime(t: String?): String {
            if (t.isNullOrBlank()) return ""
            val parts = t.split(":")
            if (parts.size < 2) return t
            val h = parts[0].toIntOrNull() ?: return t
            val m = parts[1].padStart(2, '0').take(2)
            val ampm = if (h >= 12) "PM" else "AM"
            val hour12 = ((h + 11) % 12) + 1
            return "$hour12:$m $ampm"
        }

        private fun parseHex(hex: String?, fallback: Int): Int = try {
            if (hex.isNullOrBlank()) fallback else Color.parseColor(hex)
        } catch (_: Throwable) { fallback }
    }
}
