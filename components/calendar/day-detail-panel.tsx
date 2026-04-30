'use client'

import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Clock, MoreHorizontal, CheckCircle2, Circle, Play, Ban, SkipForward, MessageCircle, Send, Trash2 } from 'lucide-react'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, PRIORITY_CONFIG, formatTime, getInitials, formatRelativeTime } from '@/lib/utils'
import { updateActivityStatus, deleteActivity, getActivityComments, createActivityComment, deleteActivityComment } from '@/lib/api'
import type { Activity, ActivityStatus, Profile, ActivityComment } from '@/types'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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

// ── Time helpers ──────────────────────────────────────────────────────────────
function timeToMin(t: string | null | undefined): number {
  if (!t) return Infinity
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getOverlappingIds(acts: Activity[]): Set<string> {
  const timed = acts.filter(a => a.start_time)
  const ids = new Set<string>()
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]
      const aS = timeToMin(a.start_time), aE = a.end_time ? timeToMin(a.end_time) : aS + 60
      const bS = timeToMin(b.start_time), bE = b.end_time ? timeToMin(b.end_time) : bS + 60
      if (aS < bE && bS < aE) { ids.add(a.id); ids.add(b.id) }
    }
  }
  return ids
}

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
  const [openCommentId, setOpenCommentId] = useState<string | null>(null)
  const [commentsMap, setCommentsMap] = useState<Record<string, ActivityComment[]>>({})
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({})
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  const isTodayDate = isToday(date)
  const dateLabel = isTodayDate ? 'Hoy' : format(date, 'EEEE', { locale: es })
  const dateSubLabel = format(date, "d 'de' MMMM 'de' yyyy", { locale: es })

  const done = activities.filter(a => a.status === 'done').length
  const total = activities.length
  const isSharedView = allUsers.length > 1

  // Sort all activities by time for overlap detection
  const overlappingIds = getOverlappingIds(activities)

  const byUser = allUsers.map(({ profile, isOwn }) => ({
    profile, isOwn,
    activities: [...activities.filter(a => a.user_id === profile.id)]
      .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time)),
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

  const handleToggleComments = useCallback(async (activityId: string) => {
    if (openCommentId === activityId) {
      setOpenCommentId(null)
      return
    }
    setOpenCommentId(activityId)
    if (!commentsMap[activityId]) {
      setCommentLoading(prev => ({ ...prev, [activityId]: true }))
      try {
        const data = await getActivityComments(activityId)
        setCommentsMap(prev => ({ ...prev, [activityId]: data }))
      } catch {}
      setCommentLoading(prev => ({ ...prev, [activityId]: false }))
    }
  }, [openCommentId, commentsMap])

  const handleAddComment = async (activityId: string) => {
    const text = newCommentText[activityId]?.trim()
    if (!text) return
    try {
      const comment = await createActivityComment(activityId, currentUserId, text)
      setCommentsMap(prev => ({ ...prev, [activityId]: [...(prev[activityId] || []), comment] }))
      setNewCommentText(prev => ({ ...prev, [activityId]: '' }))
    } catch {}
  }

  const handleDeleteComment = async (activityId: string, commentId: string) => {
    try {
      await deleteActivityComment(commentId)
      setCommentsMap(prev => ({
        ...prev,
        [activityId]: (prev[activityId] || []).filter(c => c.id !== commentId)
      }))
    } catch {}
  }

  return (
    <div className="flex-1 bg-card/50 flex flex-col overflow-hidden">
      {/* Encabezado */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h2 className={cn('text-xl font-semibold capitalize', isTodayDate && 'text-primary')}>
              {dateLabel}
            </h2>
            <p className="text-sm text-muted-foreground capitalize">{dateSubLabel}</p>
          </div>
          <button
            onClick={onAddActivity}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{done}/{total} completadas</span>
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

      {/* Lista de actividades */}
      <div className="flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <span className="text-2xl">✦</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Sin actividades aún</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Haz clic en "Agregar" para planear tu día</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {byUser.map(({ profile, isOwn, activities: userActivities }) => (
              <div key={profile.id}>
                {isSharedView && (
                  <div
                    className="flex items-center gap-2 mb-2 px-1 py-1 rounded-lg"
                    style={{ backgroundColor: profile.color + '15' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: profile.color }}
                    >
                      {profile.avatar_url
                        ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(profile.full_name, profile.email)
                      }
                    </div>
                    <span className="text-xs font-semibold" style={{ color: profile.color }}>
                      {isOwn ? 'Tú' : profile.full_name || profile.email}
                    </span>
                    {userActivities.length > 0 && (
                      <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                        {userActivities.filter(a => a.status === 'done').length}/{userActivities.length}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  {userActivities.length === 0 && isOwn ? (
                    <button onClick={onAddActivity} className="activity-card-ghost w-full text-sm">
                      <Plus className="w-4 h-4 mr-1" /> Agregar actividad
                    </button>
                  ) : (
                    userActivities.map(activity => {
                      const statusCfg = STATUS_CONFIG[activity.status]
                      const StatusIcon = STATUS_ICON[activity.status]
                      const isOwnActivity = activity.user_id === currentUserId
                      const priorityCfg = PRIORITY_CONFIG[activity.priority]
                      const isCommentOpen = openCommentId === activity.id
                      const comments = commentsMap[activity.id] || []
                      const isLoadingComments = commentLoading[activity.id]

                      return (
                        <div key={activity.id} className={cn('rounded-xl border border-l-2', statusCfg.bgColor)} style={{ borderLeftColor: profile.color }}>

                          {/* ── Time header (shown when activity has a start time) ── */}
                          {activity.start_time && (
                            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-border/40">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs font-semibold">
                                  {formatTime(activity.start_time)}
                                  {activity.end_time && (
                                    <span className="text-muted-foreground font-normal"> – {formatTime(activity.end_time)}</span>
                                  )}
                                </span>
                              </div>
                              {overlappingIds.has(activity.id) && (
                                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 shrink-0">
                                  ⚠ Simultáneo
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tarjeta principal */}
                          <div className="p-3">
                            <div className="flex items-start gap-2">
                              {/* Botón de estado */}
                              <button
                                onClick={() => handleCycleStatus(activity)}
                                disabled={!isOwnActivity}
                                className={cn(
                                  'mt-0.5 shrink-0 transition-colors',
                                  isOwnActivity ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
                                  statusCfg.textColor
                                )}
                                title={`Estado: ${statusCfg.label}${isOwnActivity ? ' (clic para cambiar)' : ''}`}
                              >
                                <StatusIcon className="w-4 h-4" />
                              </button>

                              {/* Contenido */}
                              <div
                                className={cn('flex-1 min-w-0', isOwnActivity && 'cursor-pointer')}
                                onClick={() => isOwnActivity && onEditActivity(activity)}
                              >
                                <div className="flex items-center gap-1">
                                  {activity.emoji && <span className="text-sm">{activity.emoji}</span>}
                                  <span className={cn(
                                    'text-sm font-medium break-words min-w-0',
                                    activity.status === 'done' && 'line-through opacity-60',
                                    activity.status === 'skipped' && 'opacity-40'
                                  )}>
                                    {activity.title}
                                  </span>
                                </div>

                                {activity.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                    {activity.description}
                                  </p>
                                )}

                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {/* Status badge */}
                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', statusCfg.bgColor, statusCfg.textColor)}>
                                    {statusCfg.label}
                                  </span>
                                  {/* Category badge */}
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 text-muted-foreground font-medium">
                                    {CATEGORY_CONFIG[activity.category].emoji} {CATEGORY_CONFIG[activity.category].label}
                                  </span>

                                  {activity.goal && (
                                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                      <span>{activity.goal.emoji || '🎯'}</span>
                                      <span className="max-w-[80px] truncate">{activity.goal.title}</span>
                                    </span>
                                  )}

                                  {activity.priority !== 'medium' && (
                                    <span className={cn('text-[10px] font-medium', priorityCfg.color)}>
                                      {priorityCfg.icon} {priorityCfg.label}
                                    </span>
                                  )}

                                  {activity.invited_from_activity_id && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-medium">
                                      👥 Invitado
                                    </span>
                                  )}

                                  {activity.recurrence_type !== 'none' && (
                                    <span className="text-[10px] text-primary font-medium">🔄 Recurrente</span>
                                  )}

                                  {activity.tags?.slice(0, 2).map(tag => (
                                    <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>

                                {activity.status === 'in_progress' && activity.completion_percentage > 0 && (
                                  <div className="mt-1.5 h-1 bg-background/60 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${activity.completion_percentage}%` }} />
                                  </div>
                                )}

                              {/* Evidence image */}
                              {activity.evidence_image_url && (
                                <div className="mt-2 rounded-lg overflow-hidden border border-border/50">
                                  <img
                                    src={activity.evidence_image_url}
                                    alt="Evidencia"
                                    className="w-full max-h-36 object-cover cursor-pointer"
                                    onClick={() => window.open(activity.evidence_image_url!, '_blank')}
                                    title="Ver evidencia en tamaño completo"
                                  />
                                </div>
                              )}
                              </div>

                              {/* Acciones */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {/* Botón de comentarios */}
                                {activity.is_public && (
                                  <button
                                    onClick={() => handleToggleComments(activity.id)}
                                    className={cn(
                                      'w-6 h-6 flex items-center justify-center rounded-md transition-colors text-muted-foreground',
                                      isCommentOpen ? 'bg-primary/10 text-primary' : 'hover:bg-background/60 hover:text-foreground'
                                    )}
                                    title="Comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Menú (solo propias) */}
                                {isOwnActivity && (
                                  <div className="relative">
                                    <button
                                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === activity.id ? null : activity.id) }}
                                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </button>

                                    {openMenuId === activity.id && (
                                      <div
                                        className="absolute right-0 top-7 z-50 w-56 bg-popover border border-border rounded-xl shadow-lg py-1 text-sm"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={() => { onEditActivity(activity); setOpenMenuId(null) }}
                                          className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                                        >
                                          ✏️ Editar
                                        </button>
                                        <div className="border-t border-border my-1" />
                                        <button
                                          onClick={() => handleDelete(activity)}
                                          className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors"
                                        >
                                          🗑 Eliminar esta actividad
                                        </button>
                                        {activity.recurrence_type !== 'none' && (
                                          <button
                                            onClick={() => handleDelete(activity, true)}
                                            className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive transition-colors"
                                          >
                                            🗑 Eliminar todas las recurrentes
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Sección de comentarios */}
                          {isCommentOpen && (
                            <div className="border-t border-border/50 bg-background/40 rounded-b-xl overflow-hidden">
                              {isLoadingComments ? (
                                <div className="px-3 py-2 text-xs text-muted-foreground">Cargando comentarios…</div>
                              ) : (
                                <>
                                  {comments.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-muted-foreground italic">
                                      Sin comentarios aún. ¡Sé el primero!
                                    </p>
                                  ) : (
                                    <div className="px-3 py-2 space-y-2 max-h-40 overflow-y-auto">
                                      {comments.map(comment => {
                                        const isOwnerOfComment = comment.user_id === currentUserId
                                        const commenterProfile = comment.profile
                                        return (
                                          <div key={comment.id} className="flex items-start gap-2 group">
                                            <div
                                              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 mt-0.5"
                                              style={{ backgroundColor: commenterProfile?.color || '#6366f1' }}
                                            >
                                              {commenterProfile?.avatar_url
                                                ? <img src={commenterProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                                                : getInitials(commenterProfile?.full_name, commenterProfile?.email)
                                              }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-baseline gap-1.5">
                                                <span className="text-[10px] font-semibold truncate">
                                                  {commenterProfile?.full_name || commenterProfile?.email || 'Usuario'}
                                                </span>
                                                <span className="text-[9px] text-muted-foreground shrink-0">
                                                  {formatRelativeTime(comment.created_at)}
                                                </span>
                                              </div>
                                              <p className="text-xs text-foreground/80 leading-snug">{comment.content}</p>
                                            </div>
                                            {isOwnerOfComment && (
                                              <button
                                                onClick={() => handleDeleteComment(activity.id, comment.id)}
                                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}

                                  {/* Input para nuevo comentario */}
                                  <div className="px-3 py-2 border-t border-border/30 flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={newCommentText[activity.id] || ''}
                                      onChange={e => setNewCommentText(prev => ({ ...prev, [activity.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(activity.id) } }}
                                      placeholder="Escribe un comentario…"
                                      className="flex-1 text-xs bg-background rounded-lg border border-input px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                                    />
                                    <button
                                      onClick={() => handleAddComment(activity.id)}
                                      disabled={!newCommentText[activity.id]?.trim()}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                                    >
                                      <Send className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
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

      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  )
}
