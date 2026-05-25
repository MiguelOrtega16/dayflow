'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, isToday } from 'date-fns'
import { cn, STATUS_CONFIG, statusLabel, activityColor } from '@/lib/utils'
import { updateActivityStatus } from '@/lib/api'
import type { Activity, ActivityStatus } from '@/types'
import { useI18n, dateFnsLocale } from '@/lib/i18n'
import { DeleteActivityDialog } from '@/components/activities/delete-activity-dialog'
import { useProfile } from '@/lib/profile-context'
import { normalizePreferences } from '@/lib/user-preferences'
import { useEntitlement } from '@/lib/billing/use-entitlement'

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

// ── Overlap layout ────────────────────────────────────────────────────────────
// Assigns each activity a column index and total column count so overlapping
// events are displayed side-by-side (Google Calendar style).
interface ActivityLayout { activity: Activity; col: number; numCols: number }

function computeLayout(activities: Activity[]): ActivityLayout[] {
  if (activities.length === 0) return []

  // Sort by start time; longer events first when start times match
  const sorted = [...activities].sort((a, b) => {
    const sa = timeToMin(a.start_time!), sb = timeToMin(b.start_time!)
    if (sa !== sb) return sa - sb
    const ea = a.end_time ? timeToMin(a.end_time) : sa + 60
    const eb = b.end_time ? timeToMin(b.end_time) : sb + 60
    return (eb - sb) - (ea - sa)
  })

  // Place each activity in the first column that doesn't overlap it
  const placed: { activity: Activity; col: number; end: number }[] = []
  for (const act of sorted) {
    const start = timeToMin(act.start_time!)
    const end   = act.end_time ? timeToMin(act.end_time) : start + 60
    const usedCols = new Set(placed.filter(p => p.end > start).map(p => p.col))
    let col = 0
    while (usedCols.has(col)) col++
    placed.push({ activity: act, col, end })
  }

  // numCols for each activity = widest column span in its overlap cluster
  return placed.map(({ activity, col, end }) => {
    const start = timeToMin(activity.start_time!)
    const cluster = placed.filter(p => timeToMin(p.activity.start_time!) < end && p.end > start)
    const numCols = Math.max(...cluster.map(p => p.col + 1))
    return { activity, col, numCols }
  })
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
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null)
  const { locale, t } = useI18n()

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

  // Pro-gated "color by category" toggle + per-category overrides from
  // Appearance settings. Defensive entitlement check so a downgraded account
  // with a stale 'category' value still renders the legacy owner-color blocks.
  const { profile: currentProfile } = useProfile()
  const { entitlement } = useEntitlement(currentProfile?.id ?? null)
  const { colorMode, colorOverrides } = useMemo(() => {
    const prefs = normalizePreferences(currentProfile?.preferences ?? null)
    const mode = prefs.day_view_color_by === 'category' && entitlement.isPro
      ? 'category' as const
      : 'profile' as const
    return { colorMode: mode, colorOverrides: prefs.category_color_overrides }
  }, [currentProfile?.preferences, entitlement.isPro])

  const openCtx = (e: React.MouseEvent, activity: Activity) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 216)
    const y = Math.min(e.clientY, window.innerHeight - 340)
    setCtx({ activity, x, y })
  }

  const closeCtx = () => setCtx(null)

  const canInteract = (a: Activity) =>
    a.user_id === currentUserId || !!a.invitation_id

  const handleStatus = async (activity: Activity, status: ActivityStatus) => {
    closeCtx()
    await updateActivityStatus(activity.id, status, currentUserId)
    onActivityUpdated?.()
  }

  const handleDeleteRequest = (activity: Activity) => {
    closeCtx()
    setPendingDelete(activity)
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
              {format(day, 'EEE', { locale: dateFnsLocale(locale) })}
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
              <span className="text-[8px] text-muted-foreground leading-tight text-right">{t('calendar.allDayLabel')}</span>
            </div>
            {rows.map(({ day, events }) => (
              <div key={format(day, 'yyyy-MM-dd')} className="flex-1 p-0.5 border-l border-border/40 first:border-l-0 min-h-[22px]">
                {events.map(a => {
                  const c = activityColor(a, userColor(a.user_id), colorMode, colorOverrides)
                  const interactive = canInteract(a)
                  return (
                    <button key={a.id} data-event
                      onClick={e => { e.stopPropagation(); if (interactive) onEditActivity(a) }}
                      onContextMenu={e => openCtx(e, a)}
                      className={cn(
                        'w-full text-left text-[10px] font-medium rounded px-1 py-0.5 mb-0.5 break-words',
                        interactive ? 'cursor-pointer' : 'cursor-default'
                      )}
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

                {computeLayout(timed).map(({ activity: a, col, numCols }) => {
                  const isReminder  = a.category === 'reminder'
                  const startMin    = timeToMin(a.start_time!)
                  const endMin      = !isReminder && a.end_time ? timeToMin(a.end_time) : startMin + (isReminder ? 0 : 60)
                  const top         = (startMin / 60) * HOUR_HEIGHT
                  const height      = isReminder ? 20 : Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22)
                  // Reminders always render in the dashed-purple style regardless
                  // of mode (it's the visual signal that they're zero-duration nudges,
                  // not regular events). Other activities honor the colorMode toggle.
                  const c           = isReminder ? '#9333ea' : activityColor(a, userColor(a.user_id), colorMode, colorOverrides)
                  const interactive = canInteract(a)
                  const leftPct     = col / numCols * 100
                  const widthPct    = 1  / numCols * 100
                  const isDone      = a.status === 'done'
                  const isSkipped   = a.status === 'skipped'
                  return (
                    <button key={a.id} data-event
                      onClick={e => { e.stopPropagation(); if (interactive) onEditActivity(a) }}
                      onContextMenu={e => openCtx(e, a)}
                      className={cn(
                        'absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden z-10 transition-opacity',
                        interactive ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
                        isReminder && 'border border-dashed border-purple-400 dark:border-purple-500',
                        isDone    && 'opacity-60',
                        isSkipped && 'opacity-40',
                      )}
                      style={{
                        top, height,
                        left:  `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: isReminder ? '#9333ea18' : c + '28',
                        borderLeft: isReminder ? '3px dashed #9333ea' : `3px solid ${c}`,
                      }}
                    >
                      <p
                        className={cn(
                          'text-[10px] font-semibold leading-tight truncate',
                          isDone && 'line-through',
                        )}
                        style={{ color: c }}
                      >
                        {isReminder ? '🔔' : a.emoji} {a.title}
                      </p>
                      {!isReminder && height >= 36 && (
                        <p
                          className={cn('text-[9px] leading-tight mt-0.5', isDone && 'line-through')}
                          style={{ color: c + 'bb' }}
                        >
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
                <span>✏️</span> {t('common.edit')}
              </button>
            )}

            {/* Status change — owner or accepted invitee */}
            {(ctx.activity.user_id === currentUserId || !!ctx.activity.invitation_id) && (
              <>
                <div className="border-t border-border my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {ctx.activity.invitation_id ? t('calendar.myStatus') : t('calendar.changeStatus')}
                </p>
                {(Object.keys(STATUS_CHAR) as ActivityStatus[]).map(s => (
                  <button key={s} onClick={() => handleStatus(ctx.activity, s)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2',
                      ctx.activity.status === s && 'font-semibold text-primary'
                    )}>
                    <span className={cn('text-xs', STATUS_CONFIG[s].textColor)}>{STATUS_CHAR[s]}</span>
                    {statusLabel(s, locale)}
                    {ctx.activity.status === s && <span className="ml-auto text-[10px] text-primary">{t('calendar.current')}</span>}
                  </button>
                ))}
              </>
            )}

            {/* Delete */}
            {ctx.activity.user_id === currentUserId && (
              <>
                <div className="border-t border-border my-1" />
                <button onClick={() => handleDeleteRequest(ctx.activity)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors flex items-center gap-2">
                  <span>🗑</span> {t('common.delete')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {pendingDelete && currentUserId && (
        <DeleteActivityDialog
          activity={pendingDelete}
          currentUserId={currentUserId}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => onActivityUpdated?.()}
        />
      )}
    </div>
  )
}
