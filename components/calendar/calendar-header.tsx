'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Calendar, LayoutGrid, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'

interface CalendarHeaderProps {
  currentDate: Date
  mode: 'month' | 'week' | 'day'
  onNavigate: (dir: 'prev' | 'next') => void
  onToday: () => void
  onModeChange: (mode: 'month' | 'week' | 'day') => void
  onAddActivity: () => void
  userId?: string
}

export function CalendarHeader({
  currentDate, mode, onNavigate, onToday, onModeChange, onAddActivity, userId
}: CalendarHeaderProps) {
  // All views show just the month + year; day view also shows the day number
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

  const viewToggle = (
    <div className="flex items-center bg-muted rounded-lg p-0.5">
      {([
        { key: 'month', icon: LayoutGrid,   label: 'Mes',    title: 'Vista mensual' },
        { key: 'week',  icon: Calendar,     label: 'Semana', title: 'Vista semanal' },
        { key: 'day',   icon: CalendarDays, label: 'Día',    title: 'Vista diaria'  },
      ] as const).map(({ key, icon: Icon, label, title: t }) => (
        <button
          key={key}
          onClick={() => onModeChange(key)}
          className={cn(
            'flex items-center gap-1 px-2 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
            mode === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={t}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="border-b border-border shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-10">

      {/* ── Mobile: title row with flanking arrows ── */}
      <div className="md:hidden flex items-center justify-between px-2 py-2 border-b border-border/40">
        {navBtn('prev')}
        <h1 className="text-sm font-semibold capitalize text-center flex-1 px-2">{title}</h1>
        {navBtn('next')}
      </div>

      {/* ── Controls row ── */}
      <div className="flex items-center justify-between px-2 sm:px-4 h-11 sm:h-16">

        {/* Left: Hoy + [desktop: ◀ title ▶] */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToday}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors shrink-0"
          >
            Hoy
          </button>

          {/* Desktop nav + title (hidden on mobile — arrows are in the title row) */}
          <div className="hidden md:flex items-center gap-1">
            {navBtn('prev')}
            <h1 className="text-lg font-semibold capitalize px-1">{title}</h1>
            {navBtn('next')}
          </div>
        </div>

        {/* Right: view toggle + add + bell */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {viewToggle}

          <button
            onClick={onAddActivity}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva actividad</span>
          </button>

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
