package com.chanclastudio.dayflow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PorterDuff
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R

class TodayWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> renderWidget(ctx, mgr, id) }
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: android.os.Bundle?
    ) {
        renderWidget(ctx, mgr, id)
    }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        ids.forEach { WidgetStore.clearConfig(ctx, it) }
    }

    companion object {
        /** Re-renders every active widget. Called by the bridge after data sync. */
        fun renderAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val cmp = ComponentName(ctx, TodayWidgetProvider::class.java)
            val ids = mgr.getAppWidgetIds(cmp)
            ids.forEach { renderWidget(ctx, mgr, it) }
            // Tell the list adapter to re-query its data
            if (ids.isNotEmpty()) mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
        }

        private fun renderWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.today_widget)

            // ── Apply per-widget config (color + opacity) ──
            val colorHex   = WidgetStore.readColor(ctx, widgetId)
            val opacityPct = WidgetStore.readOpacity(ctx, widgetId)
            val headerColor = parseHex(colorHex, fallback = 0xFF7C6FE3.toInt())
            val bgAlpha     = (opacityPct.coerceIn(20, 100) * 255 / 100)
            val bodyColor   = (bgAlpha shl 24) or 0x00FFFFFF

            views.setInt(R.id.widget_header, "setBackgroundColor", headerColor)
            views.setInt(R.id.widget_bg,     "setBackgroundColor", bodyColor)

            // ── List adapter ──
            val listIntent = Intent(ctx, TodayWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                // Each widget id needs a unique data URI so Android caches them separately
                data = Uri.parse("dayflow-widget://$widgetId")
            }
            views.setRemoteAdapter(R.id.widget_list, listIntent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)

            // ── Row click template (fills in toggle / open intents per row) ──
            val rowClickIntent = Intent(ctx, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_ROW_CLICK
                data = Uri.parse("dayflow-widget://row/$widgetId")
            }
            val rowClickPi = PendingIntent.getBroadcast(
                ctx, widgetId * 100,
                rowClickIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            views.setPendingIntentTemplate(R.id.widget_list, rowClickPi)

            // ── Header: refresh button ──
            val refreshIntent = Intent(ctx, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_REFRESH
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse("dayflow-widget://refresh/$widgetId")
            }
            views.setOnClickPendingIntent(
                R.id.widget_btn_refresh,
                PendingIntent.getBroadcast(
                    ctx, widgetId * 100 + 1,
                    refreshIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )

            // ── Header: configure button → opens the web config page ──
            val configIntent = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("dayflow:gotoPath", "/dashboard/widget/$widgetId")
            }
            views.setOnClickPendingIntent(
                R.id.widget_btn_config,
                PendingIntent.getActivity(
                    ctx, widgetId * 100 + 2,
                    configIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )

            // ── Title shows last-sync age when data is older than 5 min ──
            val ageMs = WidgetStore.snapshotAge(ctx)
            val label = if (ageMs > 5 * 60_000L && ageMs != Long.MAX_VALUE) "DayFlow · ${ageLabel(ageMs)}" else "DayFlow"
            views.setTextViewText(R.id.widget_title, label)

            mgr.updateAppWidget(widgetId, views)
            mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list)
        }

        private fun ageLabel(ms: Long): String {
            val min = ms / 60_000L
            return when {
                min < 60   -> "hace ${min}m"
                min < 1440 -> "hace ${min / 60}h"
                else       -> "hace ${min / 1440}d"
            }
        }

        private fun parseHex(hex: String?, fallback: Int): Int = try {
            if (hex.isNullOrBlank()) fallback else Color.parseColor(hex)
        } catch (_: Throwable) { fallback }
    }
}
