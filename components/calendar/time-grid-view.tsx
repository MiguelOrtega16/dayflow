'use client'

import { useEffect, useRef, useState } from 'react'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, STATUS_CONFIG } from '@/lib/utils'
import { updateActivityStatus, deleteActivity } from '@/lib/api'
import type { Activity, ActivityStatus } from '@/types'

const HOUR_HEIGHT = 56

const STATUS_CHAR: Record<ActivityStatus, string> = {
  todo: '○', in_progress: '▶', done: '✓', blocked: '✕', skipped: '–',
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

interface CtxMenu { activity: Activity; x: number; y: number }

interface TimeGridViewProps {
  days: Date[]
  activities: Activity[]
  allUsers: { profile: { id: string; color: string }; isOwn: boolean }[]
  currentUserId?: string
  onEditActivity: (a: Activity) => void
  onActivityUpdated?: () => void
  onAddActivityAtTime?: (startTime: string, endTime: string) => void
}

export function TimeGridView({
  days, activities, allUsers, currentUserId,
  onEditActivity, onActivityUpdated, onAddActivityAtTime,
}: TimeGridViewProps) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<CtxMenu | null>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    scrollRef.current.scrollTop = Math.max(0, (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT - 120)
  }, [])

  const HOURS  = Array.from({ length: 24 }, (_, i) => i)
  const now    = new Date()
  const nowPx  = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT

  const dayActivities = (date: Date) =>
    activities.filter(a => a.date === format(date, 'yyyy-MM-dd'))

  const userColor = (userId: string) =>
    allUsers.find(u => u.profile.id === userId)?.profile.color ?? '#6366f1'

  const openCtx = (e: React.MouseEvent, activity: Activity) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 216)
    const y = Math.min(e.clientY, window.innerHeight - 340)
    setCtx({ activity, x, y })
  }

  const closeCtx = () => setCtx(null)

  const handleStatus = async (activity: Activity, status: ActivityStatus) => {
    closeCtx()
    await updateActivityStatus(activity.id, status)
    onActivityUpdated?.()
  }

  const handleDelete = async (activity: Activity, all = false) => {
    closeCtx()
    await deleteActivity(activity.id, all)
    onActivityUpdated?.()
  }

  const handleSlotClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = Math.max(0, Math.min(22, Math.floor((e.clientY - rect.top) / HOUR_HEIGHT)))
    const fmt  = (h: number) => `${String(h).padStart(2, '0')}:00`
    onAddActivityAtTime?.(fmt(hour), fmt(hour + 1))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* Day header */}
      <div className="flex shrink-0 border-b border-border bg-card">
        <div className="w-10 shrink-0" />
        {days.map(day => (
          <div key={format(day, 'yyyy-MM-dd')} className="flex-1 flex flex-col items-center py-1.5 border-l border-border/40 first:border-l-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {format(day, 'EEE', { locale: es })}
            </span>
            <span className={cn(
              'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold mt-0.5',
              isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground',
            )}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* All-day events */}
      {(() => {
        const rows = days.map(d => ({ day: d, events: dayActivities(d).filter(a => !a.start_time) }))
        if (!rows.some(r => r.events.length)) return null
        return (
          <div className="flex shrink-0 border-b border-border bg-card">
            <div className="w-10 shrink-0 flex items-start justify-end pr-1 pt-1">
              <span className="text-[8px] text-muted-foreground leading-tight text-right">{'Todo el \ndía'}</span>
            </div>
            {rows.map(({ day, events }) => (
              <div key={format(day, 'yyyy-MM-dd')} className="flex-1 p-0.5 border-l border-border/40 first:border-l-0 min-h-[22px]">
                {events.map(a => {
                  const c = userColor(a.user_id)
                  return (
                    <button key={a.id} data-event
                      onClick={e => { e.stopPropagation(); onEditActivity(a) }}
                      onContextMenu={e => openCtx(e, a)}
                      className="w-full text-left text-[10px] font-medium rounded px-1 py-0.5 mb-0.5 break-words"
                      style={{ backgroundColor: c + '28', color: c }}
                    >
                      {a.emoji} {a.title}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })()}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: HOUR_HEIGHT * 24 }}>

          {/* Hour labels */}
          <div className="w-10 shrink-0 relative select-none">
            {HOURS.map(h => (
              <div key={h} className="absolute right-1.5 text-[10px] text-muted-foreground leading-none"
                style={{ top: h === 0 ? 2 : h * HOUR_HEIGHT - 7 }}>
                {h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const timed   = dayActivities(day).filter(a => a.start_time)
            return (
              <div key={dateStr} className="flex-1 relative border-l border-border/30 cursor-pointer" onClick={handleSlotClick}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-t border-border/25" style={{ top: h * HOUR_HEIGHT }} />
                ))}
                {HOURS.map(h => (
                  <div key={`hh-${h}`} className="absolute w-full border-t border-dashed border-border/15"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                ))}

                {isToday(day) && (
                  <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowPx }}>
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                )}

                {timed.map(a => {
                  const startMin = timeToMin(a.start_time!)
                  const endMin   = a.end_time ? timeToMin(a.end_time) : startMin + 60
                  const top      = (startMin / 60) * HOUR_HEIGHT
                  const height   = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22)
                  const c        = userColor(a.user_id)
                  return (
                    <button key={a.id} data-event
                      onClick={e => { e.stopPropagation(); onEditActivity(a) }}
                      onContextMenu={e => openCtx(e, a)}
                      className="absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 text-left overflow-hidden z-10 cursor-pointer"
                      style={{ top, height, backgroundColor: c + '28', borderLeft: `3px solid ${c}` }}
                    >
                      <p className="text-[10px] font-semibold leading-tight break-words" style={{ color: c }}>
                        {a.emoji} {a.title}
                      </p>
                      {height >= 36 && (
                        <p className="text-[9px] leading-tight mt-0.5" style={{ color: c + 'bb' }}>
                          {fmt12(a.start_time!)}{a.end_time && ` – ${fmt12(a.end_time)}`}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right-click context menu */}
      {ctx && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx() }} />
          <div
            className="fixed z-50 w-52 bg-popover border border-border rounded-xl shadow-2xl py-1 text-sm animate-scale-in"
            style={{ top: ctx.y, left: ctx.x }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 border-b border-border mb-1">
              <p className="text-xs font-semibold truncate">{ctx.activity.emoji} {ctx.activity.title}</p>
            </div>

            {/* Edit */}
            {ctx.activity.user_id === currentUserId && (
              <button onClick={() => { closeCtx(); onEditActivity(ctx.activity) }}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2">
                <span>✏️</span> Editar
              </button>
            )}

            {/* Status change */}
            {ctx.activity.user_id === currentUserId && (
              <>
                <div className="border-t border-border my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cambiar estado</p>
                {(Object.keys(STATUS_CHAR) as ActivityStatus[]).map(s => (
                  <button key={s} onClick={() => handleStatus(ctx.activity, s)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2',
                      ctx.activity.status === s && 'font-semibold text-primary'
                    )}>
                    <span className={cn('text-xs', STATUS_CONFIG[s].textColor)}>{STATUS_CHAR[s]}</span>
                    {STATUS_CONFIG[s].label}
                    {ctx.activity.status === s && <span className="ml-auto text-[10px] text-primary">actual</span>}
                  </button>
                ))}
              </>
            )}

            {/* Delete */}
            {ctx.activity.user_id === currentUserId && (
              <>
                <div className="border-t border-border my-1" />
                <button onClick={() => handleDelete(ctx.activity)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors flex items-center gap-2">
                  <span>🗑</span> Eliminar esta actividad
                </button>
                {ctx.activity.recurrence_type !== 'none' && (
                  <button onClick={() => handleDelete(ctx.activity, true)}
                    className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors flex items-center gap-2 text-xs">
                    <span>🗑</span> Eliminar todas las recurrentes
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
