'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'
import { CustomSelect } from '@/components/ui/custom-select'

interface CalendarHeaderProps {
  currentDate: Date
  mode: 'month' | 'week' | 'day'
  onNavigate: (dir: 'prev' | 'next') => void
  onToday: () => void
  onModeChange: (mode: 'month' | 'week' | 'day') => void
  userId?: string
}

const MODE_LABEL: Record<'month' | 'week' | 'day', string> = {
  month: 'Mes',
  week:  'Semana',
  day:   'Día',
}

export function CalendarHeader({
  currentDate, mode, onNavigate, onToday, onModeChange, userId
}: CalendarHeaderProps) {
  const title = mode === 'day'
    ? format(currentDate, "d 'de' MMMM yyyy", { locale: es })
    : format(currentDate, 'MMMM yyyy', { locale: es })

  const navBtn = (dir: 'prev' | 'next') => (
    <button
      onClick={() => onNavigate(dir)}
      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {dir === 'prev'
        ? <ChevronLeft className="w-4 h-4" />
        : <ChevronRight className="w-4 h-4" />}
    </button>
  )

  return (
    <div className="border-b border-border shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-10">

      {/* ── Mobile: [<] [MES YYYY] [>] on left, [Hoy] [view ▾] on right ── */}
      <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1 min-w-0">
          {navBtn('prev')}
          <h1 className="text-base font-semibold capitalize truncate">{title}</h1>
          {navBtn('next')}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToday}
            className="px-2 py-1 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Hoy
          </button>
          <CustomSelect
            value={mode}
            onChange={(v) => onModeChange(v as 'month' | 'week' | 'day')}
            ariaLabel="Vista de calendario"
            options={[
              { value: 'month', label: 'Mes' },
              { value: 'week',  label: 'Semana' },
              { value: 'day',   label: 'Día' },
            ]}
            buttonClassName="px-2.5 py-1 text-xs font-medium rounded-lg border-border min-w-[88px]"
          />
        </div>
      </div>

      {/* ── Desktop: full controls row ── */}
      <div className="hidden md:flex items-center justify-between px-4 h-16">

        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToday}
            className="px-2.5 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors shrink-0"
          >
            Hoy
          </button>
          <div className="flex items-center gap-1">
            {navBtn('prev')}
            <h1 className="text-lg font-semibold capitalize px-1">{title}</h1>
            {navBtn('next')}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['month', 'week', 'day'] as const).map(key => {
              const Icon = key === 'month' ? LayoutGrid : key === 'week' ? Calendar : CalendarDays
              return (
                <button
                  key={key}
                  onClick={() => onModeChange(key)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1.5 rounded-md text-sm font-medium transition-all',
                    mode === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={`Vista ${MODE_LABEL[key].toLowerCase()}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{MODE_LABEL[key]}</span>
                </button>
              )
            })}
          </div>

          {userId && <NotificationBell userId={userId} topBar />}
        </div>
      </div>
    </div>
  )
}
