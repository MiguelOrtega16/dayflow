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
import android.widget.RemoteViews
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Agenda widget — 4×4 tile showing today and the next 2 days as a scrollable
 * list. Activities are grouped under a small date column (weekday + day-of-
 * month) on the left, coloured event blocks on the right. Tapping a row
 * deep-links to the calendar's Day view at that date with the activity
 * opened.
 */
class AgendaWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            try { renderWidget(ctx, mgr, id) }
            catch (t: Throwable) { Log.e("DayFlowWidget", "agenda render failed id=$id", t) }
        }
        WidgetSnapshotSync.refreshIfStale(ctx)
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: android.os.Bundle?
    ) { renderWidget(ctx, mgr, id) }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        ids.forEach { WidgetStore.clearConfig(ctx, it) }
    }

    companion object {
        fun renderAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val cmp = ComponentName(ctx, AgendaWidgetProvider::class.java)
            val ids = mgr.getAppWidgetIds(cmp)
            ids.forEach { renderWidget(ctx, mgr, it) }
            // Force the list adapter to re-query its data so a new snapshot
            // (e.g. just-completed activity) appears without waiting for the
            // OS-driven periodic refresh.
            if (ids.isNotEmpty()) mgr.notifyAppWidgetViewDataChanged(ids, R.id.agenda_list)
        }

        private fun renderWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.agenda_widget)

            // ── Apply per-widget config ──
            // Body stays a neutral dark base regardless of the user's chosen
            // color — tinting the whole 4×4 tile with the brand primary made
            // the colour-coded event blocks blend into the background. The
            // user's accent is applied only to the top header bar (month
            // label), the same approach the Today widget already uses.
            val accentHex  = WidgetStore.readColor(ctx, widgetId)
            val opacityPct = WidgetStore.readOpacity(ctx, widgetId)
            val accent     = parseHex(accentHex, fallback = 0xFF7C6FE3.toInt())
            val alpha      = (opacityPct.coerceIn(20, 100) * 255 / 100)
            val baseBg     = (alpha shl 24) or 0x0F0F10
            val headerBg   = (alpha shl 24) or (accent and 0x00FFFFFF)
            views.setInt(R.id.agenda_bg,     "setBackgroundColor", baseBg)
            views.setInt(R.id.agenda_header, "setBackgroundColor", headerBg)

            // Header: current month name.
            val monthFmt = SimpleDateFormat("MMMM", Locale.getDefault()).apply { timeZone = TimeZone.getDefault() }
            views.setTextViewText(
                R.id.agenda_month,
                monthFmt.format(Date()).replaceFirstChar { it.titlecase(Locale.getDefault()) },
            )

            // ── List adapter ──
            val listIntent = Intent(ctx, AgendaWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse("dayflow-agenda-widget://$widgetId")
            }
            views.setRemoteAdapter(R.id.agenda_list, listIntent)
            views.setEmptyView(R.id.agenda_list, R.id.agenda_empty)

            // Row click → fill-in intent dispatched as a launch activity so
            // taps deep-link to the calendar Day view for the activity's date.
            // The factory builds an Intent that targets MainActivity directly.
            val rowClickTemplate = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            val rowClickPi = PendingIntent.getActivity(
                ctx, widgetId * 100,
                rowClickTemplate,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            views.setPendingIntentTemplate(R.id.agenda_list, rowClickPi)

            // Header "+" → open the dashboard's create-activity modal for today.
            val addIntent = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("dayflow:gotoPath", "/dashboard?create=today")
            }
            views.setOnClickPendingIntent(
                R.id.agenda_btn_add,
                PendingIntent.getActivity(
                    ctx, widgetId * 100 + 1,
                    addIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            mgr.updateAppWidget(widgetId, views)
            mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.agenda_list)
        }

        private fun parseHex(hex: String?, fallback: Int): Int = try {
            if (hex.isNullOrBlank()) fallback else Color.parseColor(hex)
        } catch (_: Throwable) { fallback }
    }
}
