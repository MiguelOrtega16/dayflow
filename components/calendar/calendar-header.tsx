'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Calendar, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'

interface CalendarHeaderProps {
  currentDate: Date
  mode: 'month' | 'week'
  onNavigate: (dir: 'prev' | 'next') => void
  onToday: () => void
  onModeChange: (mode: 'month' | 'week') => void
  onAddActivity: () => void
  userId?: string
}

export function CalendarHeader({
  currentDate, mode, onNavigate, onToday, onModeChange, onAddActivity, userId
}: CalendarHeaderProps) {
  const title = mode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: es })
    : `Semana del ${format(currentDate, 'd MMM yyyy', { locale: es })}`

  return (
    <div className="border-b border-border shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-10">

      {/* ── Mobile: title row ── */}
      <div className="md:hidden flex items-center justify-center px-4 py-2 border-b border-border/40">
        <h1 className="text-sm font-semibold capitalize">{title}</h1>
      </div>

      {/* ── Controls row ── */}
      <div className="flex items-center justify-between px-2 sm:px-4 h-11 sm:h-16">

        {/* Left: Hoy + arrows + title (title desktop-only) */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToday}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors shrink-0"
          >
            Hoy
          </button>
          <div className="flex items-center">
            <button
              onClick={() => onNavigate('prev')}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('next')}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* Title — desktop only (mobile shows it in the row above) */}
          <h1 className="hidden md:block text-lg font-semibold capitalize truncate">{title}</h1>
        </div>

        {/* Right: view toggle + add + bell */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => onModeChange('month')}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
                mode === 'month'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Vista mensual"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mes</span>
            </button>
            <button
              onClick={() => onModeChange('week')}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
                mode === 'week'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Vista semanal"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Semana</span>
            </button>
          </div>

          <button
            onClick={onAddActivity}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva actividad</span>
          </button>

          {/* Bell: desktop only (mobile has it in the shell top bar) */}
          {userId && (
            <div className="hidden md:flex">
              <NotificationBell userId={userId} topBar />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
