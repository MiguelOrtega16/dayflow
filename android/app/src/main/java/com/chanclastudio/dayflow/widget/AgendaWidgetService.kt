package com.chanclastudio.dayflow.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.chanclastudio.dayflow.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Service host for the Agenda widget's list adapter. Returns one
 * [AgendaWidgetFactory] per bound widget id so each tile renders against
 * its own snapshot slice (today + next 2 days).
 */
class AgendaWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        AgendaWidgetFactory(applicationContext)
}

private const val TYPE_EVENT = 0
private const val TYPE_EMPTY = 1

/** One row in the list. For TYPE_EVENT, all fields are set; for TYPE_EMPTY,
 *  only the date column is used (the right side shows a "Sin actividades"
 *  placeholder so the agenda visibly spans the full 3-day window). */
private data class AgendaRow(
    val type:       Int,
    val activityId: String? = null,
    val title:      String  = "",
    val time:       String  = "",
    val color:      Int     = 0xFF0EA5E9.toInt(),
    val date:       String  = "",   // yyyy-MM-dd
    val dowLabel:   String  = "",   // "Thu", "Fri", "Sat" — empty if not the day's first row
    val domLabel:   String  = "",   // "07" — empty if not the day's first row
)

class AgendaWidgetFactory(private val ctx: Context) : RemoteViewsService.RemoteViewsFactory {
    private var rows: List<AgendaRow> = emptyList()

    override fun onCreate() {}
    override fun onDestroy() { rows = emptyList() }

    override fun onDataSetChanged() {
        val ymd = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
        val dowFmt = SimpleDateFormat("EEE", Locale.getDefault()).apply { timeZone = TimeZone.getDefault() }
        val domFmt = SimpleDateFormat("d", Locale.US).apply { timeZone = TimeZone.getDefault() }

        // Build the 3-day window (today + next 2).
        val cal = Calendar.getInstance()
        val windowDates = (0..2).map {
            val d = ymd.format(cal.time)
            val dow = dowFmt.format(cal.time).replaceFirstChar { it.titlecase(Locale.getDefault()) }
            val dom = domFmt.format(cal.time)
            cal.add(Calendar.DAY_OF_YEAR, 1)
            Triple(d, dow, dom)
        }
        val windowSet = windowDates.map { it.first }.toSet()

        val acts = WidgetStore.readActivities(ctx)
        data class A(
            val id: String,
            val title: String,
            val date: String,
            val start: String?,
            val end: String?,
            val status: String,
            val category: String?,
        )
        val parsed = (0 until acts.length()).mapNotNull { i ->
            val o = acts.optJSONObject(i) ?: return@mapNotNull null
            val date = o.optString("date").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            if (date !in windowSet) return@mapNotNull null
            val emoji = o.optString("emoji").takeIf { it.isNotBlank() && it != "null" }
            val title = (if (emoji != null) "$emoji  " else "") + o.optString("title", "")
            A(
                id       = o.optString("id"),
                title    = title.trim(),
                date     = date,
                start    = o.optString("start_time").takeIf { it.isNotBlank() && it != "null" },
                end      = o.optString("end_time").takeIf { it.isNotBlank() && it != "null" },
                status   = o.optString("status"),
                category = o.optString("category").takeIf { it.isNotBlank() && it != "null" },
            )
        }.sortedWith(compareBy({ it.date }, { it.start ?: "99:99" }))

        val list = mutableListOf<AgendaRow>()
        for ((date, dow, dom) in windowDates) {
            val dayItems = parsed.filter { it.date == date && it.status != "done" }
            if (dayItems.isEmpty()) {
                list += AgendaRow(
                    type     = TYPE_EMPTY,
                    date     = date,
                    dowLabel = dow,
                    domLabel = dom,
                )
            } else {
                dayItems.forEachIndexed { idx, a ->
                    val time = when {
                        a.start == null               -> "Todo el día"
                        a.end != null                 -> "${fmtTime(a.start)} - ${fmtTime(a.end)}"
                        else                          -> fmtTime(a.start)
                    }
                    // Only the first event of a day shows the date column —
                    // the rest blank it out so the stacking looks like the
                    // attached agenda screenshot.
                    val isFirst = idx == 0
                    list += AgendaRow(
                        type       = TYPE_EVENT,
                        activityId = a.id,
                        title      = a.title,
                        time       = time,
                        color      = colorForCategory(a.category),
                        date       = date,
                        dowLabel   = if (isFirst) dow else "",
                        domLabel   = if (isFirst) dom else "",
                    )
                }
            }
        }

        rows = list
    }

    override fun getCount(): Int = rows.size
    override fun hasStableIds(): Boolean = true
    override fun getItemId(position: Int): Long {
        val r = rows.getOrNull(position) ?: return position.toLong()
        return (r.activityId?.hashCode() ?: (r.date.hashCode() + r.type)).toLong()
    }
    override fun getViewTypeCount(): Int = 2
    override fun getLoadingView(): RemoteViews? = null

    override fun getViewAt(position: Int): RemoteViews {
        val row = rows[position]
        return when (row.type) {
            TYPE_EMPTY -> RemoteViews(ctx.packageName, R.layout.agenda_widget_empty_day).apply {
                setTextViewText(R.id.agenda_empty_dow, row.dowLabel)
                setTextViewText(R.id.agenda_empty_dom, row.domLabel)

                // Empty-day row still deep-links to the Day view for that
                // date — tapping a quiet day jumps to its agenda anyway.
                val fill = Intent().apply {
                    putExtra("dayflow:gotoPath", "/dashboard?view=day&date=${row.date}")
                }
                setOnClickFillInIntent(R.id.agenda_empty_label, fill)
            }
            else -> RemoteViews(ctx.packageName, R.layout.agenda_widget_day_row).apply {
                setTextViewText(R.id.agenda_row_dow,   row.dowLabel)
                setTextViewText(R.id.agenda_row_dom,   row.domLabel)
                setTextViewText(R.id.agenda_row_title, row.title)
                setTextViewText(R.id.agenda_row_time,  row.time)

                // Colour the event block: tinted background (alpha ~22)
                // + matching title text. RemoteViews can't set drawable
                // borders, so we just tint the block background.
                setInt(R.id.agenda_row_block, "setBackgroundColor", withAlpha(row.color, 0x33))
                setTextColor(R.id.agenda_row_title, row.color)

                // Date column colour matches the block accent on the
                // first row of each day, muted otherwise.
                setTextColor(R.id.agenda_row_dow, row.color)
                setTextColor(R.id.agenda_row_dom, row.color)

                // Tap → /dashboard?view=day&date=YYYY-MM-DD&activity=ID
                // so the calendar lands directly on this activity inside
                // the Day view.
                val fill = Intent().apply {
                    val path = if (!row.activityId.isNullOrBlank()) {
                        "/dashboard?view=day&date=${row.date}&activity=${Uri.encode(row.activityId)}"
                    } else {
                        "/dashboard?view=day&date=${row.date}"
                    }
                    putExtra("dayflow:gotoPath", path)
                }
                setOnClickFillInIntent(R.id.agenda_row_block, fill)
            }
        }
    }

    /** Maps a category slug to a stable accent colour. Falls back to a
     *  blue when the activity has no category. Keep this small and
     *  deterministic; the home-screen widget can't read user theme. */
    private fun colorForCategory(category: String?): Int = when (category?.lowercase()) {
        "work", "trabajo"                -> 0xFF0EA5E9.toInt()  // sky
        "health", "salud", "fitness"     -> 0xFF22C55E.toInt()  // green
        "study", "estudio", "learning"   -> 0xFFA855F7.toInt()  // purple
        "social", "family", "familia"    -> 0xFFF59E0B.toInt()  // amber
        "personal"                       -> 0xFFEC4899.toInt()  // pink
        else                             -> 0xFF0EA5E9.toInt()
    }

    private fun withAlpha(color: Int, alpha: Int): Int =
        (alpha shl 24) or (color and 0x00FFFFFF)

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
}
