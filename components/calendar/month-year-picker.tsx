'use client'

import * as Popover from '@radix-ui/react-popover'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useI18n, dateFnsLocale } from '@/lib/i18n'

interface MonthYearPickerProps {
  /** Currently displayed month/year — drives the highlighted month. */
  value: Date
  /** Fired when the user picks a month. Day-of-month is set to 1. */
  onChange: (date: Date) => void
  /** Visible label inside the trigger. Already localized by the caller so we
   *  don't recompute the locale-aware "Month Year" string here. */
  label: string
  /** Tailwind classes for the trigger button — lets the calendar header
   *  reuse its existing typography (text-base / text-lg / capitalize / etc.)
   *  without this component pinning a size. */
  triggerClassName?: string
}

export function MonthYearPicker({ value, onChange, label, triggerClassName }: MonthYearPickerProps) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  // Local year state so the user can flip years inside the popover without
  // committing until they click a month. Reset to the value year whenever
  // the popover reopens so a stale year from a prior session doesn't stick.
  const [year, setYear] = useState(value.getFullYear())

  const selectedMonth = value.getMonth()
  const selectedYear  = value.getFullYear()
  const now           = new Date()
  const todayMonth    = now.getMonth()
  const todayYear     = now.getFullYear()

  // 12 localized short month names (Ene/Feb/… or Jan/Feb/…). Built off a
  // throwaway date so we get date-fns' locale-correct casing/abbreviations.
  const monthLabels = Array.from({ length: 12 }, (_, m) =>
    format(new Date(2020, m, 1), 'MMM', { locale: dateFnsLocale(locale) })
  )

  const pick = (monthIndex: number) => {
    onChange(new Date(year, monthIndex, 1))
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setYear(value.getFullYear())
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('calendar.pickDate')}
          className={cn(
            'inline-flex items-center gap-1 px-1 rounded-md hover:bg-muted/60 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
            triggerClassName,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-[100] w-64 rounded-2xl border border-border bg-popover shadow-lg p-3 font-sans animate-in fade-in-0 zoom-in-95"
        >
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setYear(y => y - 1)}
              aria-label={t('calendar.prevYear')}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">{year}</span>
            <button
              type="button"
              onClick={() => setYear(y => y + 1)}
              aria-label={t('calendar.nextYear')}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 12-month grid (4 rows × 3 cols) */}
          <div className="grid grid-cols-3 gap-1.5">
            {monthLabels.map((m, idx) => {
              const isSelected = idx === selectedMonth && year === selectedYear
              const isToday    = idx === todayMonth    && year === todayYear
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(idx)}
                  className={cn(
                    'h-9 rounded-lg text-xs font-medium capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : isToday
                        ? 'bg-primary/10 text-primary hover:bg-primary/15'
                        : 'hover:bg-muted text-foreground',
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
