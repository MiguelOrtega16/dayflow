package com.chanclastudio.dayflow.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.text.SpannableString
import android.text.Spannable
import android.text.style.StrikethroughSpan
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.chanclastudio.dayflow.R
import org.json.JSONObject

/**
 * Service host for the list adapter. Android binds to this when a widget
 * needs to populate its ListView; we return a [TodayWidgetFactory] per
 * widget id so each widget renders against its own dataset.
 */
class TodayWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        TodayWidgetFactory(applicationContext)
}

private const val TYPE_HEADER = 0
private const val TYPE_ITEM   = 1

private data class Row(
    val type:      Int,
    val label:     String,
    val id:        String?    = null,
    val title:     String?    = null,
    val time:      String?    = null,
    val done:      Boolean    = false,
)

class TodayWidgetFactory(private val ctx: Context) : RemoteViewsService.RemoteViewsFactory {
    private var rows: List<Row> = emptyList()

    override fun onCreate() {}
    override fun onDestroy() { rows = emptyList() }

    override fun onDataSetChanged() {
        val today = SupabaseRest.todayStr()
        val acts  = WidgetStore.readActivities(ctx)

        data class A(val id: String, val title: String, val date: String, val time: String?, val status: String)
        val parsed = (0 until acts.length()).mapNotNull { i ->
            val o = acts.optJSONObject(i) ?: return@mapNotNull null
            val emoji = o.optString("emoji").takeIf { it.isNotBlank() }
            val title = (if (emoji != null) "$emoji  " else "") + o.optString("title", "")
            A(
                id     = o.optString("id"),
                title  = title.trim(),
                date   = o.optString("date"),
                time   = o.optString("start_time").takeIf { it.isNotBlank() },
                status = o.optString("status"),
            )
        }

        val list = mutableListOf<Row>()

        val todayItems  = parsed.filter { it.date == today && it.status != "done" }
        val futureItems = parsed.filter { it.date >  today && it.status != "done" }
        val doneToday   = parsed.filter { it.date == today && it.status == "done" }

        if (todayItems.isNotEmpty()) {
            list += Row(TYPE_HEADER, "Today")
            todayItems.forEach { a ->
                list += Row(TYPE_ITEM, "", a.id, a.title, fmtTime(a.time), false)
            }
        }
        if (futureItems.isNotEmpty()) {
            list += Row(TYPE_HEADER, "Future")
            futureItems.forEach { a ->
                list += Row(TYPE_ITEM, "", a.id, a.title, fmtFutureDate(a.date), false)
            }
        }
        if (doneToday.isNotEmpty()) {
            list += Row(TYPE_HEADER, "Completed")
            doneToday.forEach { a ->
                list += Row(TYPE_ITEM, "", a.id, a.title, fmtTime(a.time), true)
            }
        }

        rows = list
    }

    override fun getCount(): Int = rows.size
    override fun hasStableIds(): Boolean = true
    override fun getItemId(position: Int): Long =
        rows.getOrNull(position)?.id?.hashCode()?.toLong() ?: position.toLong()
    override fun getViewTypeCount(): Int = 2
    override fun getLoadingView(): RemoteViews? = null

    override fun getViewAt(position: Int): RemoteViews {
        val row = rows[position]
        return when (row.type) {
            TYPE_HEADER -> RemoteViews(ctx.packageName, R.layout.today_widget_section).apply {
                setTextViewText(R.id.section_label, row.label)
            }
            else -> RemoteViews(ctx.packageName, R.layout.today_widget_item).apply {
                // Title — strike through when completed
                val text: CharSequence = if (row.done) {
                    SpannableString(row.title ?: "").apply {
                        setSpan(StrikethroughSpan(), 0, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                } else (row.title ?: "")
                setTextViewText(R.id.item_title, text)
                if (row.done) setTextColor(R.id.item_title, Color.parseColor("#888888"))
                else          setTextColor(R.id.item_title, Color.parseColor("#1A1A1A"))

                setTextViewText(R.id.item_time, row.time ?: "")

                // Circle: filled-green when done, hollow otherwise
                setImageViewResource(
                    R.id.item_circle,
                    if (row.done) R.drawable.ic_widget_circle_done else R.drawable.ic_widget_circle,
                )

                // Fill in the row's pending-intent template (defined in the provider)
                val fill = Intent().apply {
                    putExtra(WidgetActionReceiver.EXTRA_ACTIVITY_ID, row.id)
                    putExtra(WidgetActionReceiver.EXTRA_CURRENTLY_DONE, row.done)
                }
                setOnClickFillInIntent(R.id.item_circle, fill)
            }
        }
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

    private fun fmtFutureDate(d: String): String {
        // Display as DD-MM (or DD-MM-YYYY if more than a year out)
        val parts = d.split("-")
        if (parts.size < 3) return d
        val year = parts[0].toIntOrNull() ?: return d
        val now  = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
        return if (year > now) "${parts[2]}-${parts[1]}-${parts[0]}"
               else            "${parts[2]}-${parts[1]}"
    }
}
