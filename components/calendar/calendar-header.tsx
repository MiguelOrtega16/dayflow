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
    <div className="flex items-center justify-between px-2 sm:px-4 h-12 sm:h-16 border-b border-border shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Hoy
        </button>
        <div className="flex items-center">
          <button
            onClick={() => onNavigate('prev')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <h1 className="text-sm sm:text-lg font-semibold capitalize truncate max-w-[120px] sm:max-w-none">{title}</h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          <button
            onClick={() => onModeChange('month')}
            className={cn(
              'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-sm font-medium transition-all',
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
              'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-sm font-medium transition-all',
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
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva actividad</span>
          <span className="sm:hidden">Agregar</span>
        </button>

        {/* Notification bell — desktop only; mobile gets it from the top bar */}
        {userId && (
          <div className="hidden md:flex">
            <NotificationBell userId={userId} topBar />
          </div>
        )}
      </div>
    </div>
  )
}
