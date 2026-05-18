'use client'

import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { useI18n, weekdayNarrow } from '@/lib/i18n'
import type { Activity } from '@/types'

interface CompactMonthGridProps {
  currentDate: Date
  selectedDate: Date
  days?: Date[]          // supply for week strip mode (skip month calculation)
  activities: Activity[]
  holidays: Map<string, string>
  allUsers: { profile: { id: string; color: string }; isOwn: boolean }[]
  activeUserIds: string[]
  onDateSelect: (date: Date) => void
}

export function CompactMonthGrid({
  currentDate, selectedDate, days: propDays, activities, holidays,
  allUsers, activeUserIds, onDateSelect,
}: CompactMonthGridProps) {
  const { locale } = useI18n()
  const DAY_LABELS = weekdayNarrow(locale)
  const days = propDays ?? eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(currentDate),   { weekStartsOn: 0 }),
  })

  const getColors = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const hits = activities.filter(a => a.date === dateStr && activeUserIds.includes(a.user_id))
    const seen = new Set<string>()
    return hits
      .map(a => allUsers.find(u => u.profile.id === a.user_id)?.profile.color ?? '#6366f1')
      .filter(c => { if (seen.has(c)) return false; seen.add(c); return true })
      .slice(0, 3)
  }

  return (
    <div className="flex flex-col h-full px-2 pt-1 pb-0.5">
      {/* Day-name header */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 content-start">
        {days.map(day => {
          const dateStr  = format(day, 'yyyy-MM-dd')
          const selected = isSameDay(day, selectedDate)
          const inMonth  = isSameMonth(day, currentDate)
          const today    = isToday(day)
          const holiday  = holidays.has(dateStr)
          const colors   = getColors(day)

          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect(day)}
              className="flex flex-col items-center py-0.5"
            >
              <div className={cn(
                'w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                selected                       && 'bg-primary text-primary-foreground',
                !selected && today             && 'font-bold text-primary',
                !selected && !inMonth          && 'text-muted-foreground/30',
                !selected && inMonth && !today && 'text-foreground',
                !selected && holiday && inMonth && 'text-red-500 dark:text-red-400',
              )}>
                {format(day, 'd')}
              </div>
              {colors.length > 0 && (
                <div className="flex gap-px mt-px">
                  {colors.map((c, i) => (
                    <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
