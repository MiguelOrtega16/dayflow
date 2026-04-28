'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X } from 'lucide-react'
import { cn, STATUS_CONFIG, getInitials, formatTime } from '@/lib/utils'
import { deleteActivity, updateActivityStatus } from '@/lib/api'
import type { Activity, ActivityStatus, Profile } from '@/types'

interface DayCellProps {
  date: Date
  activities: Activity[]
  isCurrentMonth: boolean
  isSelected: boolean
  isToday: boolean
  mode: 'month' | 'week'
  currentUserId: string
  allUsers: { profile: Profile; isOwn: boolean }[]
  loading: boolean
  holiday?: string
  onClick: () => void
  onAddActivity: () => void
  onEditActivity: (activity: Activity) => void
  onActivityUpdated: () => void
}

const STATUS_CHAR: Record<ActivityStatus, string> = {
  todo: '○', in_progress: '▶', done: '✓', blocked: '✕', skipped: '–',
}

const STATUS_PILL_BG: Record<ActivityStatus, string> = {
  todo:        'bg-slate-100   dark:bg-slate-600/40',
  in_progress: 'bg-amber-50   dark:bg-amber-500/25',
  done:        'bg-emerald-50 dark:bg-emerald-600/25',
  blocked:     'bg-red-50     dark:bg-red-600/25',
  skipped:     'bg-gray-100   dark:bg-gray-600/20',
}

const MAX_VISIBLE = 5

interface ContextMenu {
  activity: Activity
  x: number
  y: number
}

export function DayCell({
  date, activities, isCurrentMonth, isSelected, isToday,
  mode, currentUserId, allUsers, loading, holiday,
  onClick, onAddActivity, onEditActivity, onActivityUpdated
}: DayCellProps) {
  const [showAll, setShowAll]       = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isWeekMode   = mode === 'week'
  const isSharedView = allUsers.length > 1
  const isWeekend    = date.getDay() === 0 || date.getDay() === 6
  const isRightEdge  = date.getDay() >= 5

  const done     = activities.filter(a => a.status === 'done').length
  const total    = activities.length
  const progress = total > 0 ? (done / total) * 100 : 0

  const visibleActivities = isWeekMode ? activities : activities.slice(0, MAX_VISIBLE)
  const overflowCount     = isWeekMode ? 0 : Math.max(0, total - MAX_VISIBLE)

  const openContextMenu = (e: React.MouseEvent, activity: Activity) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 208)
    const y = Math.min(e.clientY, window.innerHeight - 320)
    setContextMenu({ activity, x, y })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleQuickStatus = async (activity: Activity, status: ActivityStatus) => {
    closeContextMenu()
    await updateActivityStatus(activity.id, status)
    onActivityUpdated()
  }

  const handleDelete = async (activity: Activity, deleteAll = false) => {
    closeContextMenu()
    setDeletingId(activity.id)
    try {
      await deleteActivity(activity.id, deleteAll)
      onActivityUpdated()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      onClick={() => { onClick(); setShowAll(false); closeContextMenu() }}
      className={cn(
        'day-cell group relative',
        isWeekend && !isToday && !isSelected && 'bg-muted/25 dark:bg-muted/15',
        isSelected && 'day-cell-selected',
        isToday && 'day-cell-today',
        !isCurrentMonth && 'opacity-40',
        isWeekMode && 'min-h-[200px] sm:min-h-[240px]'
      )}
    >
      {/* ── Day number row ── */}
      <div className="flex items-center gap-1 mb-1">
        <span className={cn(
          'w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-[11px] sm:text-sm font-medium transition-colors shrink-0',
          isToday ? 'bg-primary text-primary-foreground font-bold'
            : isSelected ? 'bg-primary/15 text-primary font-semibold'
            : 'text-foreground'
        )}>
          {format(date, 'd')}
        </span>

        {/* Holiday label (right side) */}
        <div className="flex-1 min-w-0 relative flex items-center justify-end overflow-hidden">
          {holiday && (
            <span
              className="text-[9px] font-medium text-amber-700 dark:text-amber-400 truncate transition-opacity duration-150 sm:group-hover:opacity-0 pointer-events-none select-none"
              title={holiday}
            >
              🇨🇴 {holiday}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onAddActivity() }}
            title="Nueva actividad"
            className="absolute right-0 w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all opacity-30 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {total > 0 && (
        <div className="h-0.5 rounded-full bg-muted mb-1 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* ── Activity pills ── */}
      <div className="space-y-0.5">
        {loading ? (
          <div className="space-y-1">
            {[1, 2].map(i => <div key={i} className="h-4 rounded shimmer" />)}
          </div>
        ) : (
          <>
            {visibleActivities.map(activity => (
              <ActivityPill
                key={activity.id}
                activity={activity}
                currentUserId={currentUserId}
                allUsers={allUsers}
                isSharedView={isSharedView}
                deleting={deletingId === activity.id}
                onClick={onClick}
                onEditActivity={onEditActivity}
                onContextMenu={openContextMenu}
              />
            ))}

            {overflowCount > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setShowAll(true) }}
                className="w-full text-left text-[10px] font-semibold text-primary px-1.5 py-0.5 rounded-md hover:bg-primary/10 transition-colors leading-tight"
              >
                +{overflowCount} más
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Expanded floating card ── */}
      {showAll && (
        <>
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowAll(false) }} />
          <div
            className={cn(
              'absolute top-full mt-1 z-50 w-64 max-h-80 overflow-y-auto',
              'bg-popover border border-border rounded-2xl shadow-2xl p-3 animate-scale-in',
              isRightEdge ? 'right-0' : 'left-0'
            )}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
              <span className="text-xs font-semibold capitalize">
                {format(date, "d 'de' MMMM", { locale: es })}
                <span className="text-muted-foreground font-normal ml-1">· {total} actividad{total !== 1 ? 'es' : ''}</span>
              </span>
              <button onClick={e => { e.stopPropagation(); setShowAll(false) }}
                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1">
              {activities.map(activity => (
                <ActivityPill key={activity.id} activity={activity} currentUserId={currentUserId}
                  allUsers={allUsers} isSharedView={isSharedView} deleting={deletingId === activity.id}
                  onClick={() => { setShowAll(false); onClick() }}
                  onEditActivity={a => { setShowAll(false); onEditActivity(a) }}
                  onContextMenu={openContextMenu} expanded
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={e => { e.preventDefault(); closeContextMenu() }} />
          <div
            className="fixed z-50 w-52 bg-popover border border-border rounded-xl shadow-2xl py-1 text-sm animate-scale-in"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={e => e.stopPropagation()}
          >
            {/* Activity title */}
            <div className="px-3 py-1.5 border-b border-border mb-1">
              <p className="text-xs font-semibold truncate">{contextMenu.activity.emoji} {contextMenu.activity.title}</p>
            </div>

            {/* View/open in panel */}
            <button onClick={() => { closeContextMenu(); onClick() }}
              className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2">
              <span>📋</span> Ver detalles del día
            </button>

            {/* Edit (own only) */}
            {contextMenu.activity.user_id === currentUserId && (
              <button onClick={() => { closeContextMenu(); onEditActivity(contextMenu.activity) }}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2">
                <span>✏️</span> Editar
              </button>
            )}

            {/* Status change (own only) */}
            {contextMenu.activity.user_id === currentUserId && (
              <>
                <div className="border-t border-border my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cambiar estado</p>
                {(Object.keys(STATUS_CHAR) as ActivityStatus[]).map(s => (
                  <button key={s} onClick={() => handleQuickStatus(contextMenu.activity, s)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2',
                      contextMenu.activity.status === s && 'font-semibold text-primary'
                    )}
                  >
                    <span className={cn('text-xs', STATUS_CONFIG[s].textColor)}>{STATUS_CHAR[s]}</span>
                    {STATUS_CONFIG[s].label}
                    {contextMenu.activity.status === s && <span className="ml-auto text-[10px] text-primary">actual</span>}
                  </button>
                ))}
              </>
            )}

            {/* Delete (own only) */}
            {contextMenu.activity.user_id === currentUserId && (
              <>
                <div className="border-t border-border my-1" />
                <button onClick={() => handleDelete(contextMenu.activity)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors flex items-center gap-2">
                  <span>🗑</span> Eliminar esta actividad
                </button>
                {contextMenu.activity.recurrence_type !== 'none' && (
                  <button onClick={() => handleDelete(contextMenu.activity, true)}
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

// ─── Activity Pill ────────────────────────────────────────────────────────────
function ActivityPill({
  activity, currentUserId, allUsers, isSharedView, deleting = false,
  expanded = false, onClick, onEditActivity, onContextMenu,
}: {
  activity: Activity
  currentUserId: string
  allUsers: { profile: Profile; isOwn: boolean }[]
  isSharedView: boolean
  deleting?: boolean
  expanded?: boolean
  onClick: () => void
  onEditActivity: (a: Activity) => void
  onContextMenu: (e: React.MouseEvent, a: Activity) => void
}) {
  const statusCfg   = STATUS_CONFIG[activity.status]
  const userProfile = allUsers.find(u => u.profile.id === activity.user_id)?.profile
  const userColor   = userProfile?.color || '#6366f1'
  const isOwn       = activity.user_id === currentUserId

  return (
    <div
      onClick={e => { e.stopPropagation(); if (isOwn) onEditActivity(activity); else onClick() }}
      onContextMenu={e => onContextMenu(e, activity)}
      className={cn(
        'relative flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs transition-opacity overflow-hidden',
        isOwn ? 'cursor-pointer hover:opacity-80' : 'cursor-default hover:opacity-70',
        STATUS_PILL_BG[activity.status],
        activity.status === 'done'    && 'opacity-60',
        activity.status === 'skipped' && 'opacity-40',
        deleting && 'opacity-30 pointer-events-none',
      )}
      style={{ borderLeft: `2.5px solid ${userColor}` }}
      title={`${userProfile ? (userProfile.full_name || userProfile.email) + ': ' : ''}${activity.title} · ${statusCfg.label}${activity.start_time ? ' · ' + formatTime(activity.start_time) : ''}`}
    >
      <span className={cn('text-[9px] font-bold shrink-0 leading-none', statusCfg.textColor)}>
        {STATUS_CHAR[activity.status]}
      </span>

      {activity.emoji && <span className="text-[10px] shrink-0 leading-none">{activity.emoji}</span>}

      <span className={cn('font-medium flex-1 truncate leading-tight', activity.status === 'done' && 'line-through')}>
        {activity.title}
      </span>

      {activity.start_time && (
        <span className="text-[9px] text-muted-foreground shrink-0 font-medium tabular-nums">
          {formatTime(activity.start_time)}
        </span>
      )}

      {activity.invited_from_activity_id && (
        <span className="text-[8px] shrink-0 opacity-70" title="Actividad a la que fuiste invitado">👥</span>
      )}

      {expanded && activity.goal && (
        <span className="text-[9px] shrink-0 opacity-60" title={activity.goal.title}>
          {activity.goal.emoji || '🎯'}
        </span>
      )}

      {isSharedView && userProfile && (
        <span className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
          style={{ backgroundColor: userColor }}>
          {userProfile.avatar_url
            ? <img src={userProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
            : getInitials(userProfile.full_name, userProfile.email).charAt(0)}
        </span>
      )}

      {/* In-progress completion bar */}
      {activity.status === 'in_progress' && activity.completion_percentage > 0 && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-amber-400 rounded-sm"
          style={{ width: `${activity.completion_percentage}%` }} />
      )}
    </div>
  )
}
