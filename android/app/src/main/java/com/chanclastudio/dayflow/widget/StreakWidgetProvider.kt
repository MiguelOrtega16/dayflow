package com.chanclastudio.dayflow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import com.chanclastudio.dayflow.MainActivity
import com.chanclastudio.dayflow.R

/**
 * Streak widget — 2x2 tile showing current streak (consecutive days with
 * at least one completed activity) and today's done/total. Pro-only on the
 * web side; the gate is enforced by gating the pin request, not at runtime
 * here (once pinned, the widget keeps rendering).
 */
class StreakWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            try { renderWidget(ctx, mgr, id) }
            catch (t: Throwable) { Log.e("DayFlowWidget", "streak render failed id=$id", t) }
        }
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: android.os.Bundle?
    ) { renderWidget(ctx, mgr, id) }

    companion object {
        fun renderAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val cmp = ComponentName(ctx, StreakWidgetProvider::class.java)
            mgr.getAppWidgetIds(cmp).forEach { renderWidget(ctx, mgr, it) }
        }

        private fun renderWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.streak_widget)

            val stats = WidgetStore.readStats(ctx)
            views.setTextViewText(R.id.streak_count, stats.streakDays.toString())
            views.setTextViewText(R.id.streak_today, "${stats.todayDone}/${stats.todayTotal} hoy")

            // Tap anywhere → open the app's stats page
            val openIntent = Intent(ctx, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("dayflow:gotoPath", "/dashboard/stats")
            }
            views.setOnClickPendingIntent(
                R.id.streak_bg,
                PendingIntent.getActivity(
                    ctx, widgetId * 100,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )

            mgr.updateAppWidget(widgetId, views)
        }
    }
}
