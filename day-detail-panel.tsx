'use client'

import { format, isToday } from 'date-fns'
import { Plus, Clock, MoreHorizontal, CheckCircle2, Circle, Play, Ban, SkipForward } from 'lucide-react'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, PRIORITY_CONFIG, formatTime, getInitials } from '@/lib/utils'
import { updateActivityStatus, deleteActivity } from '@/lib/api'
import type { Activity, ActivityStatus, Profile } from '@/types'
import { useState } from 'react'

interface DayDetailPanelProps {
  date: Date
  activities: Activity[]
  currentUserId: string
  currentUserColor: string
  allUsers: { profile: Profile; isOwn: boolean }[]
  onAddActivity: () => void
  onEditActivity: (activity: Activity) => void
  onActivityUpdated: () => void
}

const STATUS_CYCLE: ActivityStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'skipped']

const STATUS_ICON = {
  todo: Circle,
  in_progress: Play,
  done: CheckCircle2,
  blocked: Ban,
  skipped: SkipForward,
}

export function DayDetailPanel({
  date, activities, currentUserId, currentUserColor,
  allUsers, onAddActivity, onEditActivity, onActivityUpdated
}: DayDetailPanelProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const isTodayDate = isToday(date)
  const dateLabel = isTodayDate ? 'Today' : format(date, 'EEEE')
  const dateSubLabel = format(date, isTodayDate ? 'MMMM d, yyyy' : 'MMMM d, yyyy')

  const done = activities.filter(a => a.status === 'done').length
  const total = activities.length

  // Group activities by user
  const byUser = allUsers.map(({ profile, isOwn }) => ({
    profile, isOwn,
    activities: activities.filter(a => a.user_id === profile.id),
  })).filter(u => u.activities.length > 0 || u.isOwn)

  const handleCycleStatus = async (activity: Activity) => {
    if (activity.user_id !== currentUserId) return
    const currentIdx = STATUS_CYCLE.indexOf(activity.status)
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]
    await updateActivityStatus(activity.id, nextStatus)
    onActivityUpdated()
  }

  const handleDelete = async (activity: Activity, deleteAll = false) => {
    if (activity.user_id !== currentUserId) return
    await deleteActivity(activity.id, deleteAll)
    setOpenMenuId(null)
    onActivityUpdated()
  }

  return (
    <div className="w-80 border-l border-border bg-card/50 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h2 className={cn('text-xl font-display', isTodayDate && 'text-primary')}>
              {dateLabel}
            </h2>
            <p className="text-sm text-muted-foreground">{dateSubLabel}</p>
          </div>
          <button
            onClick={onAddActivity}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Progress */}
        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{done}/{total} complete</span>
              <span>{Math.round((done / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <span className="text-2xl">✦</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">No activities yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Click "Add" to plan your day</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {byUser.map(({ profile, isOwn, activities: userActivities }) => (
              <div key={profile.id}>
                {allUsers.length > 1 && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-offset-1 shrink-0"
                      style={{ backgroundColor: profile.color, outlineColor: profile.color }}
                    >
                      {profile.avatar_url
                        ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(profile.full_name, profile.email)
                      }
                    </div>
                    <span className="text-xs font-semibold" style={{ color: profile.color }}>
                      {isOwn ? 'Your activities' : profile.full_name || profile.email}
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: profile.color + '40' }} />
                  </div>
                )}
                <div className="space-y-1.5">
                  {userActivities.length === 0 && isOwn ? (
                    <button
                      onClick={onAddActivity}
                      className="activity-card-ghost w-full text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add activity
                    </button>
                  ) : (
                    userActivities.map(activity => {
                      const statusCfg = STATUS_CONFIG[activity.status]
                      const StatusIcon = STATUS_ICON[activity.status]
                      const isOwn = activity.user_id === currentUserId
                      const priorityCfg = PRIORITY_CONFIG[activity.priority]

                      return (
                        <div
                          key={activity.id}
                          className={cn(
                            'activity-card',
                            statusCfg.bgColor,
                            'border-l-2'
                          )}
                          style={{ borderLeftColor: profile.color }}
                        >
                          <div className="flex items-start gap-2">
                            {/* Status toggle */}
                            <button
                              onClick={() => handleCycleStatus(activity)}
                              disabled={!isOwn}
                              className={cn(
                                'mt-0.5 shrink-0 transition-colors',
                                isOwn ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
                                statusCfg.textColor
                              )}
                              title={`Status: ${statusCfg.label}${isOwn ? ' (click to change)' : ''}`}
                            >
                              <StatusIcon className="w-4 h-4" />
                            </button>

                            {/* Content */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => isOwn && onEditActivity(activity)}
                            >
                              <div className="flex items-center gap-1">
                                {activity.emoji && <span className="text-sm">{activity.emoji}</span>}
                                <span
                                  className={cn(
                                    'text-sm font-medium truncate',
                                    activity.status === 'done' && 'line-through opacity-60',
                                    activity.status === 'skipped' && 'opacity-40'
                                  )}
                                >
                                  {activity.title}
                                </span>
                              </div>

                              {activity.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {activity.description}
                                </p>
                              )}

                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {/* Goal link badge */}
                                {activity.goal && (
                                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                    🎯 {activity.goal.title}
                                  </span>
                                )}

                                {/* Category badge */}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 text-muted-foreground font-medium">
                                  {CATEGORY_CONFIG[activity.category].emoji} {CATEGORY_CONFIG[activity.category].label}
                                </span>

                                {/* Priority */}
                                {activity.priority !== 'medium' && (
                                  <span className={cn('text-[10px] font-medium', priorityCfg.color)}>
                                    {priorityCfg.icon} {priorityCfg.label}
                                  </span>
                                )}

                                {/* Time */}
                                {activity.start_time && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                    <Clock className="w-2.5 h-2.5" />
                                    {formatTime(activity.start_time)}
                                    {activity.end_time && ` – ${formatTime(activity.end_time)}`}
                                  </span>
                                )}

                                {/* Recurrence badge */}
                                {activity.recurrence_type !== 'none' && (
                                  <span className="text-[10px] text-primary font-medium">🔄 Recurring</span>
                                )}

                                {/* Tags */}
                                {activity.tags?.slice(0, 2).map(tag => (
                                  <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    #{tag}
                                  </span>
                                ))}
                              </div>

                              {/* Completion bar */}
                              {activity.status === 'in_progress' && activity.completion_percentage > 0 && (
                                <div className="mt-1.5 h-1 bg-background/60 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-400 rounded-full"
                                    style={{ width: `${activity.completion_percentage}%` }}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Menu */}
                            {isOwn && (
                              <div className="relative shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(openMenuId === activity.id ? null : activity.id)
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>

                                {openMenuId === activity.id && (
                                  <div
                                    className="absolute right-0 top-7 z-50 w-40 bg-popover border border-border rounded-xl shadow-lg py-1 text-sm"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => { onEditActivity(activity); setOpenMenuId(null) }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                                    >
                                      ✏️ Edit
                                    </button>
                                    <div className="border-t border-border my-1" />
                                    <button
                                      onClick={() => handleDelete(activity)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors"
                                    >
                                      🗑 Delete this
                                    </button>
                                    {activity.recurrence_type !== 'none' && (
                                      <button
                                        onClick={() => handleDelete(activity, true)}
                                        className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors"
                                      >
                                        🗑 Delete all recurring
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close menus on outside click */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </div>
  )
}
