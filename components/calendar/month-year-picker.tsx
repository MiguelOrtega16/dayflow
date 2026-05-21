'use client'

import * as Popover from '@radix-ui/react-popover'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
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

  // Refs for keyboard arrow-key navigation across the 3x4 month grid.
  const monthButtonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const focusMonth = (idx: number) => monthButtonsRef.current[idx]?.focus()

  // Wraps within the 12 indices. Up/Down step by 3 (the grid column count)
  // so the focus follows the visual column the user is in.
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const idxStr = target.dataset?.monthIdx
    if (idxStr == null) return
    const idx = Number(idxStr)
    let next: number | null = null
    if      (e.key === 'ArrowLeft')  next = (idx + 11) % 12
    else if (e.key === 'ArrowRight') next = (idx + 1)  % 12
    else if (e.key === 'ArrowUp')    next = (idx + 9)  % 12
    else if (e.key === 'ArrowDown')  next = (idx + 3)  % 12
    if (next !== null) {
      e.preventDefault()
      focusMonth(next)
    }
  }

  // PageUp / PageDown step the year regardless of which element holds
  // focus inside the popover — keeps year-jumping reachable without
  // moving focus to the arrow buttons.
  const handlePopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'PageUp')   { e.preventDefault(); setYear(y => y - 1) }
    if (e.key === 'PageDown') { e.preventDefault(); setYear(y => y + 1) }
  }

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
          onOpenAutoFocus={(e) => {
            // Default Radix behavior focuses the first focusable element
            // (the prev-year arrow). Override so the selected month gets
            // focus instead — that's the natural starting point for
            // arrow-key navigation across the grid.
            e.preventDefault()
            requestAnimationFrame(() => focusMonth(selectedMonth))
          }}
          onKeyDown={handlePopoverKeyDown}
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

          {/* 12-month grid (4 rows × 3 cols). Arrow keys navigate inside
              the grid; Tab still moves between grid + year arrows. */}
          <div className="grid grid-cols-3 gap-1.5" onKeyDown={handleGridKeyDown}>
            {monthLabels.map((m, idx) => {
              const isSelected = idx === selectedMonth && year === selectedYear
              const isToday    = idx === todayMonth    && year === todayYear
              return (
                <button
                  key={m}
                  ref={(el) => { monthButtonsRef.current[idx] = el }}
                  type="button"
                  data-month-idx={idx}
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
