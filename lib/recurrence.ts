import { addDays, addHours, addMonths, addWeeks, addYears, format, isWeekend, parseISO } from 'date-fns'
import type { RecurrenceConfig, RecurrenceType } from '@/types'

export interface RecurrenceInstance {
  date: string         // yyyy-MM-dd
  start_time?: string  // HH:mm — populated for hourly (and custom hour-interval) so each instance gets its own time
}

// Hard cap on total instances per recurring activity. Per-frequency UI caps in
// the modal kick in long before this for most cases; this is the safety net
// that catches a runaway end_date or a direct-API insert. Mirrored in
// MAX_TOTAL_INSTANCES in components/activities/activity-form-modal.tsx.
export const RECURRENCE_HARD_CAP = 500

export function generateRecurrenceDates(
  startDate: string,
  recurrenceType: RecurrenceType,
  config: RecurrenceConfig,
  baseStartTime: string | null = null,
): RecurrenceInstance[] {
  const interval = config.interval && config.interval > 0 ? config.interval : 1
  const maxOccurrences = config.occurrences && config.occurrences > 0 ? config.occurrences : 30
  // Push end_date to the very end of its own day so activities scheduled on
  // that day still count as in-range (parseISO gives 00:00, and any later time
  // on the same day would otherwise be excluded by `next > endDate`).
  const endDate = config.end_date ? parseISO(config.end_date) : null
  if (endDate) endDate.setHours(23, 59, 59, 999)

  // Anchor the cursor at the start date — include the time component when
  // available so hourly increments roll over midnight correctly.
  let current = parseISO(startDate)
  if (baseStartTime) {
    const [h, m] = baseStartTime.split(':').map(Number)
    current.setHours(h, m || 0, 0, 0)
  }

  const out: RecurrenceInstance[] = [{
    date: startDate,
    start_time: baseStartTime ?? undefined,
  }]

  type Unit = 'hour' | 'day' | 'week' | 'month' | 'year' | 'weekdays' | 'days_of_week'
  const unit: Unit = (() => {
    if (recurrenceType === 'hourly') return 'hour'
    if (recurrenceType === 'daily')  return 'day'
    if (recurrenceType === 'weekly') return 'week'
    if (recurrenceType === 'monthly') return 'month'
    if (recurrenceType === 'yearly') return 'year'
    if (recurrenceType === 'weekdays') return 'weekdays'
    if (recurrenceType === 'custom') {
      if (config.days_of_week && config.days_of_week.length > 0) return 'days_of_week'
      return (config.frequency ?? 'day') as Unit
    }
    return 'day'
  })()

  const limit = endDate ? RECURRENCE_HARD_CAP : Math.min(maxOccurrences, RECURRENCE_HARD_CAP)

  for (let i = 1; i < limit; i++) {
    let next: Date
    switch (unit) {
      case 'hour':  next = addHours(current, interval);  break
      case 'day':   next = addDays(current, interval);   break
      case 'week':  next = addWeeks(current, interval);  break
      case 'month': next = addMonths(current, interval); break
      case 'year':  next = addYears(current, interval);  break
      case 'weekdays':
        next = addDays(current, 1)
        while (isWeekend(next)) next = addDays(next, 1)
        break
      case 'days_of_week':
        next = addDays(current, 1)
        while (!config.days_of_week!.includes(next.getDay())) next = addDays(next, 1)
        break
      default:
        return out
    }

    if (endDate && next > endDate) break
    out.push({
      date: format(next, 'yyyy-MM-dd'),
      // Carry per-instance time only for hour-granular recurrences; all other
      // units inherit the parent's start_time via the spread in createRecurringActivities.
      start_time: unit === 'hour' && baseStartTime ? format(next, 'HH:mm') : undefined,
    })
    current = next
  }

  return out
}
