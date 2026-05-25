'use client'

import { format, isToday } from 'date-fns'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Plus, Clock, MoreHorizontal, CheckCircle2, Circle, Play, Ban, SkipForward, MessageCircle, Send, Trash2, ChevronDown, Loader2, Pencil } from 'lucide-react'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, PRIORITY_CONFIG, getInitials, formatRelativeTime, statusLabel, categoryLabel, priorityLabel, activityColor } from '@/lib/utils'
import { useDateTimePrefs } from '@/lib/datetime-prefs'
import { useProfile } from '@/lib/profile-context'
import { normalizePreferences } from '@/lib/user-preferences'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { updateActivityStatus, getActivityComments, createActivityComment, deleteActivityComment } from '@/lib/api'
import { DeleteActivityDialog } from '@/components/activities/delete-activity-dialog'
import type { Activity, ActivityStatus, Profile, ActivityComment } from '@/types'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n, useFormatDate, dateFnsLocale } from '@/lib/i18n'

interface DayDetailPanelProps {
  date: Date
  activities: Activity[]
  currentUserId: string
  currentUserColor: string
  allUsers: { profile: Profile; isOwn: boolean }[]
  onAddActivity: () => void
  onEditActivity: (activity: Activity) => void
  onActivityUpdated: () => void
  /** True while the parent is fetching activities — used to show a spinner
      instead of the empty-state ("no activities") so a slow fetch doesn't
      flash a false-empty message before real data arrives. */
  loading?: boolean
  /** Notifies the parent (CalendarView) when the user is actively typing in
   *  a comment composer. The parent uses this to hide the FAB and the
   *  compact month grid so the keyboard-driven layout doesn't make the
   *  send button or the panel header collide with other UI. */
  onComposingChange?: (composing: boolean) => void
  /** Notification-bell deep link: scroll this activity into view and (when
   *  openActivityComments is true) auto-expand its comment thread. Cleared
   *  by the parent via onOpenActivityConsumed once we've acted on it. */
  openActivityId?: string | null
  openActivityComments?: boolean
  onOpenActivityConsumed?: () => void
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
  allUsers, onAddActivity, onEditActivity, onActivityUpdated, loading = false,
  onComposingChange,
  openActivityId = null, openActivityComments = false, onOpenActivityConsumed,
}: DayDetailPanelProps) {
  const { formatTime } = useDateTimePrefs()
  const [openCommentId, setOpenCommentId] = useState<string | null>(null)
  const [commentsMap, setCommentsMap] = useState<Record<string, ActivityComment[]>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({})
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({})
  const [commentSubmitting, setCommentSubmitting] = useState<Record<string, boolean>>({})
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set())
  const [transitioning, setTransitioning] = useState(false)
  const [updatingIds, setUpdatingIds]     = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null)
  const supabase = createClient()
  const { locale, t } = useI18n()
  const fmt = useFormatDate()
  // Ref so the Realtime callback always reads the current openCommentId without stale closure
  const openCommentIdRef = useRef<string | null>(null)
  const prevDateStr = useRef(format(date, 'yyyy-MM-dd'))
  // Per-activity card refs for scroll-into-view when a notification deep
  // link targets that activity. Stored in a Map so we can attach via ref
  // callback inside the card renderer without re-allocating on every render.
  const activityCardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Brief fade when switching days
  useEffect(() => {
    const str = format(date, 'yyyy-MM-dd')
    if (str === prevDateStr.current) return
    prevDateStr.current = str
    setTransitioning(true)
    const t = setTimeout(() => setTransitioning(false), 220)
    return () => clearTimeout(t)
  }, [date])

  // Deep-link consumer: when the notification bell hands us an openActivityId
  // (and optionally openActivityComments), find the matching card, scroll it
  // into view, and pop its comment thread when requested. We wait until the
  // activity actually exists in `activities` (parent fetches per-date are
  // async) before consuming, so a tap that pre-empts the fetch still works.
  useEffect(() => {
    if (!openActivityId) return
    const exists = activities.some(a => a.id === openActivityId)
    if (!exists) return

    // Defer a tick so the DOM has the card mounted before we measure.
    const raf = requestAnimationFrame(() => {
      const node = activityCardRefs.current.get(openActivityId)
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (openActivityComments && openCommentId !== openActivityId) {
        handleToggleComments(openActivityId)
      }
      onOpenActivityConsumed?.()
    })
    return () => cancelAnimationFrame(raf)
  }, [openActivityId, openActivityComments, activities])

  const toggleUserCollapse = (userId: string) => {
    setCollapsedUsers(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  // Pre-fetch comment counts for all visible activities
  useEffect(() => {
    const ids = activities.map(a => a.id)
    if (ids.length === 0) { setCommentCounts({}); return }
    const load = async () => {
      try {
        const { data } = await supabase
          .from('activity_comments')
          .select('activity_id')
          .in('activity_id', ids)
        if (!data) return
        const counts: Record<string, number> = {}
        for (const row of data) counts[row.activity_id] = (counts[row.activity_id] || 0) + 1
        setCommentCounts(counts)
      } catch {}
    }
    load()
  }, [activities.map(a => a.id).join(',')])

  // Keep ref in sync so Realtime callback always sees the latest value
  useEffect(() => { openCommentIdRef.current = openCommentId }, [openCommentId])

  // Realtime: update counts and live-append messages when another user comments
  useEffect(() => {
    const activityIds = activities.map(a => a.id)
    if (activityIds.length === 0) return

    const channel = supabase
      .channel(`day-comments-${currentUserId}-${date.toISOString().split('T')[0]}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'activity_comments',
      }, async (payload: any) => {
        const { activity_id, id, user_id } = payload.new
        if (!activityIds.includes(activity_id)) return

        // Reload counts for all visible activities — avoids double-counting with optimistic updates
        try {
          const { data } = await supabase
            .from('activity_comments')
            .select('activity_id')
            .in('activity_id', activityIds)
          if (data) {
            const counts: Record<string, number> = {}
            for (const row of data) counts[row.activity_id] = (counts[row.activity_id] || 0) + 1
            setCommentCounts(counts)
          }
        } catch {}

        // If the comment section is open and the comment is from someone else, fetch and append it
        if (openCommentIdRef.current === activity_id && user_id !== currentUserId) {
          try {
            const { data: comment } = await supabase
              .from('activity_comments')
              .select('*, profile:profiles(*)')
              .eq('id', id)
              .single()
            if (comment) {
              setCommentsMap(prev => {
                const existing = prev[activity_id] || []
                if (existing.some(c => c.id === id)) return prev
                return { ...prev, [activity_id]: [...existing, comment as ActivityComment] }
              })
            }
          } catch {}
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activities.map(a => a.id).join(','), currentUserId])

  const isTodayDate = isToday(date)
  const dateLabel = isTodayDate ? t('common.today') : format(date, 'EEEE', { locale: dateFnsLocale(locale) })
  const dateSubLabel = fmt(date, 'long')

  const myProfile = allUsers.find(u => u.isOwn)?.profile

  // Resolve the current user's preferred card-color source + per-category
  // overrides. The Appearance toggle and picker are Pro-gated; the
  // entitlement check here is defensive so a stale 'category' on a
  // downgraded account still renders correctly.
  const { profile: currentProfile } = useProfile()
  const { entitlement } = useEntitlement(currentProfile?.id ?? null)
  const { colorMode, colorOverrides } = useMemo(() => {
    const prefs = normalizePreferences(currentProfile?.preferences ?? null)
    const mode = prefs.day_view_color_by === 'category' && entitlement.isPro
      ? 'category' as const
      : 'profile' as const
    return { colorMode: mode, colorOverrides: prefs.category_color_overrides }
  }, [currentProfile?.preferences, entitlement.isPro])

  const done = activities.filter(a => a.status === 'done').length
  const total = activities.length
  const isSharedView = allUsers.length > 1

  const overlappingIds = getOverlappingIds(activities)

  // Section 1: Own activities sorted by time
  const myActivities = activities
    .filter(a => a.user_id === currentUserId)
    .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time))

  // Section 2: Activities I'm a participant in, grouped by owner
  const sharedGroupMap = new Map<string, { profile: Profile | null; activities: Activity[] }>()
  for (const act of activities.filter(a => !!a.invitation_id)) {
    const ownerId = act.user_id
    if (!sharedGroupMap.has(ownerId)) {
      sharedGroupMap.set(ownerId, {
        profile: allUsers.find(u => u.profile.id === ownerId)?.profile || act.profile || null,
        activities: [],
      })
    }
    sharedGroupMap.get(ownerId)!.activities.push(act)
  }
  const sharedGroups = [...sharedGroupMap.values()].map(g => ({
    ...g,
    activities: [...g.activities].sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time)),
  }))

  // Section 3: Other users' solo activities (calendar shared, I'm not participating)
  const othersGroups = allUsers
    .filter(u => !u.isOwn)
    .map(u => ({
      profile: u.profile,
      activities: activities
        .filter(a => a.user_id === u.profile.id && !a.invitation_id)
        .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time)),
    }))
    .filter(g => g.activities.length > 0)

  const showSectionHeaders = sharedGroups.length > 0 || othersGroups.length > 0 || isSharedView

  const markUpdating = (id: string, on: boolean) => {
    setUpdatingIds(prev => {
      const next = new Set(prev)
      on ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleCycleStatus = async (activity: Activity) => {
    const canUpdate = activity.user_id === currentUserId || !!activity.invitation_id
    if (!canUpdate) return
    const currentIdx = STATUS_CYCLE.indexOf(activity.status)
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]
    markUpdating(activity.id, true)
    try {
      await updateActivityStatus(activity.id, nextStatus, currentUserId)
      onActivityUpdated()
    } finally {
      markUpdating(activity.id, false)
    }
  }

  const handleDeleteRequest = (activity: Activity) => {
    if (activity.user_id !== currentUserId) return
    setPendingDelete(activity)
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
    if (commentSubmitting[activityId]) return
    const text = newCommentText[activityId]?.trim()
    if (!text) return
    setCommentSubmitting(prev => ({ ...prev, [activityId]: true }))
    try {
      const comment = await createActivityComment(activityId, currentUserId, text)
      setCommentsMap(prev => ({ ...prev, [activityId]: [...(prev[activityId] || []), comment] }))
      setCommentCounts(prev => ({ ...prev, [activityId]: (prev[activityId] || 0) + 1 }))
      setNewCommentText(prev => ({ ...prev, [activityId]: '' }))
    } catch {} finally {
      setCommentSubmitting(prev => ({ ...prev, [activityId]: false }))
    }
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

  // Ref-callback factory: attaches each activity card's root <div> into the
  // map so deep-link scrolling can find it by id. Returns void to keep React
  // happy (a refCallback that returns the element confuses StrictMode).
  const setActivityCardRef = (activityId: string) => (el: HTMLDivElement | null) => {
    if (el) activityCardRefs.current.set(activityId, el)
    else activityCardRefs.current.delete(activityId)
  }

  const renderActivityCard = (activity: Activity, ownerColor: string) => {
    // 'profile' (default) keeps the legacy owner-color border. 'category'
    // (Pro) substitutes the activity's category color (with user overrides)
    // so the day-list re-reads as "what kind of thing" at a glance.
    const borderColor = activityColor(activity, ownerColor, colorMode, colorOverrides)
    const isParticipant = !!activity.invitation_id
    const statusCfg = STATUS_CONFIG[activity.status]
    const StatusIcon = STATUS_ICON[activity.status]
    const isOwnActivity = activity.user_id === currentUserId
    const canInteract = isOwnActivity || isParticipant
    const priorityCfg = PRIORITY_CONFIG[activity.priority]
    const isCommentOpen = openCommentId === activity.id
    const comments = commentsMap[activity.id] || []
    const isLoadingComments = commentLoading[activity.id]

    const isReminderActivity = activity.category === 'reminder'

    // ── Reminder card: simplified visual ──────────────────────────────────────
    if (isReminderActivity) {
      const isDone    = activity.status === 'done'
      const isSkipped = activity.status === 'skipped'
      const isUpdating = updatingIds.has(activity.id)
      // Border tracks the picker when in 'category' mode; 'profile' mode keeps
      // the legacy purple. Background / icon stay Tailwind purple — the colored
      // border alone is enough to signal the override without losing the
      // "this is a reminder" treatment.
      const reminderBorder = colorMode === 'category'
        ? (colorOverrides?.reminder ?? '#9333ea')
        : '#9333ea'
      // Reminders don't cycle through the full 5-state STATUS_CYCLE — most
      // users just want to mark "remembered" vs. "didn't yet". Tap toggles
      // between todo and done; the dropdown still covers other transitions.
      const toggleReminderDone = async () => {
        if (!canInteract) return
        const next = isDone ? 'todo' : 'done'
        markUpdating(activity.id, true)
        try {
          await updateActivityStatus(activity.id, next, currentUserId)
          onActivityUpdated()
        } finally {
          markUpdating(activity.id, false)
        }
      }
      return (
        <div
          key={activity.id}
          ref={setActivityCardRef(activity.id)}
          className={cn(
            'rounded-xl border border-l-2 bg-purple-50/50 dark:bg-purple-500/5 transition-opacity',
            isDone    && 'opacity-60',
            isSkipped && 'opacity-40',
          )}
          style={{ borderLeftColor: reminderBorder }}
        >
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <button
              onClick={toggleReminderDone}
              disabled={!canInteract || isUpdating}
              aria-label={isDone ? t('calendar.markAsTodo') : t('calendar.markAsDone')}
              className={cn(
                'shrink-0 transition-colors',
                canInteract ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
                isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-500 dark:text-purple-400',
              )}
            >
              {isUpdating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isDone
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <Circle className="w-4 h-4" />}
            </button>
            <span className="text-base shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', isDone && 'line-through')}>
                {activity.title}
              </p>
              {activity.start_time && (
                <p className={cn(
                  'text-xs text-purple-600 dark:text-purple-400 font-medium mt-0.5',
                  isDone && 'line-through',
                )}>
                  {formatTime(activity.start_time)}
                  {activity.recurrence_type !== 'none' && ` · 🔄 ${t('calendar.recurring')}`}
                </p>
              )}
            </div>
            {isOwnActivity && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                    className="z-50 w-44 bg-popover border border-border rounded-xl shadow-lg py-1 text-sm"
                    onClick={e => e.stopPropagation()}
                  >
                    <DropdownMenu.Item onSelect={() => onEditActivity(activity)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors outline-none cursor-pointer">
                      <Pencil className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span>{t('common.edit')}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="border-t border-border my-1" />
                    <DropdownMenu.Item onSelect={() => handleDeleteRequest(activity)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-destructive transition-colors outline-none cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('common.delete')}</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      )
    }

    return (
      <div
        key={activity.id}
        ref={setActivityCardRef(activity.id)}
        className={cn('rounded-xl border border-l-2', statusCfg.bgColor)}
        style={{ borderLeftColor: borderColor }}
      >

        {/* ── Time header ── */}
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
                ⚠ {t('calendar.simultaneous')}
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
              disabled={!canInteract || updatingIds.has(activity.id)}
              className={cn(
                'mt-0.5 shrink-0 transition-colors',
                canInteract ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
                statusCfg.textColor
              )}
              title={canInteract
                ? t('calendar.eventTitleInteractive', { label: statusLabel(activity.status, locale) })
                : t('calendar.eventTitle', { label: statusLabel(activity.status, locale) })}
            >
              {updatingIds.has(activity.id)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <StatusIcon className="w-4 h-4" />}
            </button>

            {/* Contenido */}
            <div
              className={cn('flex-1 min-w-0', canInteract && 'cursor-pointer')}
              onClick={() => canInteract && onEditActivity(activity)}
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
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', statusCfg.bgColor, statusCfg.textColor)}>
                  {statusLabel(activity.status, locale)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 text-muted-foreground font-medium">
                  {CATEGORY_CONFIG[activity.category].emoji} {categoryLabel(activity.category, locale)}
                </span>

                {activity.goal && (
                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    <span>{activity.goal.emoji || '🎯'}</span>
                    <span className="max-w-[80px] truncate">{activity.goal.title}</span>
                  </span>
                )}

                {activity.priority !== 'medium' && (
                  <span className={cn('text-[10px] font-medium', priorityCfg.color)}>
                    {priorityCfg.icon} {priorityLabel(activity.priority, locale)}
                  </span>
                )}

                {activity.invited_from_activity_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-medium">
                    👥 {t('calendar.invited')}
                  </span>
                )}

                {activity.recurrence_type !== 'none' && (
                  <span className="text-[10px] text-primary font-medium">🔄 {t('calendar.recurring')}</span>
                )}

                {activity.tags?.slice(0, 2).map((tag, i) => (
                  <span key={`${tag}-${i}`} className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    #{tag}
                  </span>
                ))}
              </div>

              {activity.status === 'in_progress' && activity.completion_percentage > 0 && (
                <div className="mt-1.5 h-1 bg-background/60 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${activity.completion_percentage}%` }} />
                </div>
              )}

              {/* Participant avatars */}
              {activity.participants && activity.participants.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">👥</span>
                  {activity.participants.map(p => (
                    <div key={p.invitee_id} className="flex items-center gap-1">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                        style={{ backgroundColor: p.profile.color || '#6366f1' }}
                        title={p.profile.full_name || p.profile.email || ''}
                      >
                        {p.profile.avatar_url
                          ? <img src={p.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                          : getInitials(p.profile.full_name, p.profile.email).charAt(0)}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                        {p.profile.full_name?.split(' ')[0] || p.profile.email?.split('@')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Evidence image */}
              {activity.evidence_image_url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-border/50">
                  <img
                    src={activity.evidence_image_url}
                    alt={t('calendar.evidenceAlt')}
                    className="w-full max-h-36 object-cover cursor-pointer"
                    onClick={() => window.open(activity.evidence_image_url!, '_blank')}
                    title={t('calendar.evidenceFull')}
                  />
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(activity.is_public || canInteract) && (
                <button
                  onClick={() => handleToggleComments(activity.id)}
                  className={cn(
                    'flex items-center gap-0.5 px-1 h-6 rounded-md transition-colors text-muted-foreground',
                    isCommentOpen ? 'bg-primary/10 text-primary' : 'hover:bg-background/60 hover:text-foreground'
                  )}
                  title={t('calendar.commentsTitle')}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {(commentCounts[activity.id] ?? 0) > 0 && (
                    <span className="text-[9px] font-bold leading-none">
                      {commentCounts[activity.id]}
                    </span>
                  )}
                </button>
              )}

              {isOwnActivity && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      collisionPadding={8}
                      className="z-50 w-52 bg-popover border border-border rounded-xl shadow-lg py-1 text-sm max-h-[80vh] overflow-y-auto"
                      onClick={e => e.stopPropagation()}
                    >
                      <DropdownMenu.Item
                        onSelect={() => onEditActivity(activity)}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors outline-none cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span>{t('common.edit')}</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="border-t border-border my-1" />
                      <DropdownMenu.Label className="px-3 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('goals.statusHeading')}</DropdownMenu.Label>
                      {STATUS_CYCLE.map(s => {
                        const cfg = STATUS_CONFIG[s]
                        const Icon = STATUS_ICON[s]
                        const isCurrent = activity.status === s
                        return (
                          <DropdownMenu.Item
                            key={s}
                            onSelect={async () => {
                              if (isCurrent) return
                              markUpdating(activity.id, true)
                              try {
                                await updateActivityStatus(activity.id, s, currentUserId)
                                onActivityUpdated()
                              } finally {
                                markUpdating(activity.id, false)
                              }
                            }}
                            className={cn(
                              'flex items-center gap-2 px-3 py-1.5 transition-colors outline-none cursor-pointer',
                              isCurrent ? 'bg-muted font-medium' : 'hover:bg-muted'
                            )}
                          >
                            <Icon className={cn('w-3.5 h-3.5 shrink-0', cfg.color)} />
                            <span>{statusLabel(s, locale)}</span>
                            {isCurrent && <span className="ml-auto text-[10px] text-muted-foreground">✓</span>}
                          </DropdownMenu.Item>
                        )
                      })}
                      <DropdownMenu.Separator className="border-t border-border my-1" />
                      <DropdownMenu.Item
                        onSelect={() => handleDeleteRequest(activity)}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-destructive transition-colors outline-none cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('common.delete')}</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          </div>
        </div>

        {/* Sección de comentarios */}
        {isCommentOpen && (
          <div className="border-t border-border/50 bg-background/40 rounded-b-xl overflow-hidden">
            {isLoadingComments ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t('calendar.loadingComments')}</div>
            ) : (
              <>
                {comments.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">
                    {t('calendar.noCommentsYet')}
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
                                {commenterProfile?.full_name || commenterProfile?.email || t('calendar.anonymous')}
                              </span>
                              <span className="text-[9px] text-muted-foreground shrink-0">
                                {formatRelativeTime(comment.created_at, locale)}
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

                <div className="relative z-10 bg-card px-3 py-2 border-t border-border/30 flex items-center gap-2">
                  <input
                    type="text"
                    value={newCommentText[activity.id] || ''}
                    onChange={e => setNewCommentText(prev => ({ ...prev, [activity.id]: e.target.value }))}
                    onFocus={() => onComposingChange?.(true)}
                    onBlur={() => onComposingChange?.(false)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(activity.id) } }}
                    placeholder={t('calendar.writeComment')}
                    disabled={commentSubmitting[activity.id]}
                    className="flex-1 text-xs bg-background rounded-lg border border-input px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 disabled:opacity-60"
                  />
                  <button
                    onClick={() => handleAddComment(activity.id)}
                    disabled={!newCommentText[activity.id]?.trim() || !!commentSubmitting[activity.id]}
                    aria-busy={!!commentSubmitting[activity.id]}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-90 shrink-0"
                  >
                    {commentSubmitting[activity.id]
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 bg-card/50 flex flex-col overflow-hidden min-h-0">
      {/* Encabezado — opaque bg so the keyboard pushing layout up can't make
          this overlay the compact month grid above it on mobile. */}
      <div className="px-4 py-4 border-b border-border bg-card relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className={cn('text-xl font-semibold capitalize', isTodayDate && 'text-primary')}>
                {dateLabel}
              </h2>
              {transitioning && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            </div>
            <p className="text-sm text-muted-foreground capitalize">{dateSubLabel}</p>
          </div>
          <button
            onClick={onAddActivity}
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors animate-attention"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('calendar.add')}
          </button>
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{t('calendar.progress', { done, total })}</span>
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
      <div className={cn('flex-1 overflow-y-auto transition-opacity duration-200', transitioning && 'opacity-40 pointer-events-none')}>
        {(loading || transitioning) && total === 0 ? (
          // Fetch in flight (or fast day-switch fade) — don't show the empty
          // state yet, it would flash a misleading "no activities" message
          // before the data lands.
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-xs text-muted-foreground/70 mt-3">{t('calendar.loadingActivities')}</p>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <span className="text-2xl">✦</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t('calendar.noActivities')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('calendar.noActivitiesHelp')}</p>
          </div>
        ) : (
          // pb-24 reserves space below the last card for the mobile FAB
          // (anchored ~64 px above the bottom nav, ~56 px tall) so the last
          // activity in a long list isn't covered by the floating +.
          <div className="p-3 pb-24 space-y-4">

            {/* ── Section 1: My activities ── */}
            <div>
              {showSectionHeaders && myProfile && (
                <button
                  onClick={() => toggleUserCollapse(currentUserId)}
                  className="w-full flex items-center gap-2 mb-2 px-1 py-1 rounded-lg"
                  style={{ backgroundColor: myProfile.color + '15' }}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: myProfile.color }}>
                    {myProfile.avatar_url
                      ? <img src={myProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(myProfile.full_name, myProfile.email)}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: myProfile.color }}>{t('common.you')}</span>
                  {myActivities.length > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                      {myActivities.filter(a => a.status === 'done').length}/{myActivities.length}
                    </span>
                  )}
                  <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200', collapsedUsers.has(currentUserId) && '-rotate-90')} />
                </button>
              )}
              {!collapsedUsers.has(currentUserId) && (
                <div className="space-y-1.5">
                  {myActivities.length === 0 ? (
                    <button onClick={onAddActivity} className="activity-card-ghost w-full text-sm">
                      <Plus className="w-4 h-4 mr-1" /> {t('calendar.addActivity')}
                    </button>
                  ) : (
                    myActivities.map(a => renderActivityCard(a, myProfile?.color || currentUserColor))
                  )}
                </div>
              )}
            </div>

            {/* ── Section 2: Shared activities (I'm a participant) ── */}
            {sharedGroups.map((group, gi) => {
              const sectionId = (group.profile?.id ?? `shared-${gi}`) + ':shared'
              const collapsed  = collapsedUsers.has(sectionId)
              return (
                <div key={group.profile?.id ?? `shared-${gi}`}>
                  <button
                    onClick={() => toggleUserCollapse(sectionId)}
                    className="w-full flex items-center gap-2 mb-2 px-1 py-1 rounded-lg"
                    style={{ backgroundColor: (group.profile?.color || '#6366f1') + '15' }}
                  >
                    {/* Overlapping avatars: owner + me */}
                    <div className="flex items-center shrink-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-background"
                        style={{ backgroundColor: group.profile?.color || '#6366f1' }}>
                        {group.profile?.avatar_url
                          ? <img src={group.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                          : getInitials(group.profile?.full_name, group.profile?.email)}
                      </div>
                      {myProfile && (
                        <div className="-ml-2 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ring-2 ring-background"
                          style={{ backgroundColor: myProfile.color || currentUserColor }}>
                          {myProfile.avatar_url
                            ? <img src={myProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                            : getInitials(myProfile.full_name, myProfile.email).charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold ml-1" style={{ color: group.profile?.color || '#6366f1' }}>
                      {t('calendar.youWith', { name: group.profile?.full_name?.split(' ')[0] || group.profile?.email || t('calendar.sharedWithYou') })}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                      {group.activities.filter(a => a.status === 'done').length}/{group.activities.length}
                    </span>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200', collapsed && '-rotate-90')} />
                  </button>
                  {!collapsed && (
                    <div className="space-y-1.5">
                      {group.activities.map(a => renderActivityCard(a, group.profile?.color || '#6366f1'))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* ── Section 3: Other users' solo activities ── */}
            {othersGroups.map(group => {
              const sectionId = group.profile.id + ':solo'
              const collapsed  = collapsedUsers.has(sectionId)
              return (
                <div key={group.profile.id}>
                  <button
                    onClick={() => toggleUserCollapse(sectionId)}
                    className="w-full flex items-center gap-2 mb-2 px-1 py-1 rounded-lg"
                    style={{ backgroundColor: group.profile.color + '15' }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: group.profile.color }}>
                      {group.profile.avatar_url
                        ? <img src={group.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(group.profile.full_name, group.profile.email)}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: group.profile.color }}>
                      {group.profile.full_name || group.profile.email}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                      {group.activities.filter(a => a.status === 'done').length}/{group.activities.length}
                    </span>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200', collapsed && '-rotate-90')} />
                  </button>
                  {!collapsed && (
                    <div className="space-y-1.5">
                      {group.activities.map(a => renderActivityCard(a, group.profile.color || '#6366f1'))}
                    </div>
                  )}
                </div>
              )
            })}

          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteActivityDialog
          activity={pendingDelete}
          currentUserId={currentUserId}
          onClose={() => setPendingDelete(null)}
          onDeleted={onActivityUpdated}
        />
      )}
    </div>
  )
}
