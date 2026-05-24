'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, subDays, parseISO } from 'date-fns'
import { getActivitiesForRange, updateActivityStatus } from '@/lib/api'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, PRIORITY_CONFIG } from '@/lib/utils'
import { useDateTimePrefs } from '@/lib/datetime-prefs'
import type { Activity, ActivityStatus, ActivityCategory } from '@/types'
import {
  CheckCircle2, Circle, Play, Ban, SkipForward, Loader2,
  Search, ChevronDown, Clock, Target, Calendar as CalendarIcon, X, GripVertical,
  Trash2,
} from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useI18n, useFormatDate } from '@/lib/i18n'
import { useProfile } from '@/lib/profile-context'
import { BillingDebugButton } from '@/components/billing-debug-button'
import { PageTour } from '@/components/onboarding/page-tour'
import { DeleteActivityDialog } from '@/components/activities/delete-activity-dialog'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'

const STATUS_ICONS = {
  todo: Circle,
  in_progress: Play,
  done: CheckCircle2,
  blocked: Ban,
  skipped: SkipForward,
}

const STATUS_CYCLE: ActivityStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'skipped']

const PRIMARY_STATUSES: ActivityStatus[] = ['todo', 'in_progress', 'done']
const SECONDARY_STATUSES: ActivityStatus[] = ['blocked', 'skipped']

export default function OverviewPage() {
  const { t } = useI18n()
  const fmt = useFormatDate()
  // Profile from dashboard layout's server fetch — page renders its filters
  // and headers immediately, only the activities list waits on its fetch.
  const { profile } = useProfile()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | '7days' | '30days' | '90days'>('today')
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<ActivityCategory>>(new Set())
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  // Per-status accordion open state. All three primary columns + the two
  // secondary ones default to open; user can collapse any to focus.
  const [openStatuses, setOpenStatuses] = useState<Set<ActivityStatus>>(
    () => new Set<ActivityStatus>(['todo', 'in_progress', 'done', 'blocked', 'skipped'])
  )
  const toggleStatus = (s: ActivityStatus) => {
    setOpenStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  // PointerSensor with a small activation distance lets taps on the in-card
  // status button still work — only past 6px of movement does it start a drag.
  // TouchSensor uses a noticeable hold delay + larger tolerance so users
  // scrolling through a long list don't accidentally pick up a card when
  // their finger briefly pauses on a row. Drag is a deliberate long-press.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 400, tolerance: 10 } }),
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingActivity = useMemo(
    () => activities.find(a => a.id === draggingId) ?? null,
    [activities, draggingId],
  )

  const handleDragStart = (e: DragStartEvent) => {
    setDraggingId(String(e.active.id))
    // Auto-expand the Blocked/Skipped panel so it's reachable as a drop
    // target without forcing the user to expand it first.
    setSecondaryOpen(true)
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setDraggingId(null)
    if (!e.over) return
    const overData = e.over.data.current as { status?: ActivityStatus } | undefined
    const nextStatus = overData?.status
    if (!nextStatus) return
    const activity = activities.find(a => a.id === String(e.active.id))
    if (!activity || activity.status === nextStatus) return

    // Optimistic: flip the status locally so the card pops to the new column
    // immediately, no flash from a full refetch.
    const previous = activity.status
    setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, status: nextStatus } : a))
    setUpdatingIds(prev => new Set(prev).add(activity.id))
    try {
      await updateActivityStatus(activity.id, nextStatus, profile?.id)
    } catch (err) {
      console.error('[overview] drop status update failed', err)
      // Roll back optimistic move on failure.
      setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, status: previous } : a))
    } finally {
      setUpdatingIds(prev => { const s = new Set(prev); s.delete(activity.id); return s })
    }
  }

  useEffect(() => {
    if (!profile?.id) return
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, profile?.id])

  const loadData = async () => {
    if (!profile?.id) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const days = range === '7days' ? 6 : range === '30days' ? 29 : range === '90days' ? 89 : 0
    const start = format(subDays(new Date(), days), 'yyyy-MM-dd')
    const data = await getActivitiesForRange(start, today, [profile.id], profile.id)
    setActivities(data)
    setLoading(false)
  }

  const handleCycleStatus = async (activity: Activity) => {
    const idx = STATUS_CYCLE.indexOf(activity.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setUpdatingIds(prev => new Set(prev).add(activity.id))
    try {
      await updateActivityStatus(activity.id, next, profile?.id)
      await loadData()
    } finally {
      setUpdatingIds(prev => { const s = new Set(prev); s.delete(activity.id); return s })
    }
  }

  const handleDeleteRequest = (activity: Activity) => {
    setPendingDelete(activity)
  }

  const toggleCategory = (c: ActivityCategory) => {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  // Filter pipeline — search by title/description + category chips
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activities.filter(a => {
      if (activeCategories.size > 0 && !activeCategories.has(a.category)) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        (a.description?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [activities, search, activeCategories])

  const grouped = useMemo(() => ({
    todo:        filtered.filter(a => a.status === 'todo'),
    in_progress: filtered.filter(a => a.status === 'in_progress'),
    done:        filtered.filter(a => a.status === 'done'),
    blocked:     filtered.filter(a => a.status === 'blocked'),
    skipped:     filtered.filter(a => a.status === 'skipped'),
  }), [filtered])

  const totalAll       = activities.length
  const totalFiltered  = filtered.length
  const doneFiltered   = grouped.done.length
  const pct = totalFiltered > 0 ? Math.round((doneFiltered / totalFiltered) * 100) : 0
  const hasFilter      = search.trim().length > 0 || activeCategories.size > 0

  const secondaryCount = grouped.blocked.length + grouped.skipped.length

  // Tour gate — read from preferences alongside the profile fetch. The
  // banner persists its own dismissal so this only needs to flip once.
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
  const showTour = !!profile && prefs.dismissed_tour_overview !== true

  const sortColumn = (acts: Activity[]) =>
    [...acts].sort((a, b) => {
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time)
      if (a.start_time) return -1
      if (b.start_time) return 1
      return a.title.localeCompare(b.title)
    })

  const now = new Date()
  const greeting = now.getHours() < 12 ? t('overview.greetingMorning')
                 : now.getHours() < 18 ? t('overview.greetingAfternoon')
                 : t('overview.greetingEvening')
  const rangeLabel = (r: typeof range) => t(`overview.ranges.${r}`)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto">
      <BillingDebugButton />
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-semibold truncate">
                {greeting}, {profile?.full_name?.split(' ')[0] || t('overview.greetingFallback')} 👋
              </h1>
              <InfoTooltip text={t('overview.info')} />
            </div>
            <p className="text-sm text-muted-foreground capitalize">
              {fmt(new Date(), 'full')}
            </p>
          </div>
          <div className="flex items-center bg-muted rounded-xl p-1 w-full sm:w-auto sm:shrink-0">
            {(['today', '7days', '30days', '90days'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn(
                  'flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-center',
                  range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}>
                {rangeLabel(r)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
        Status-ring + per-status breakdown card hidden — it duplicates the
        donut + tiles already shown on Estadísticas, and the Kanban column
        headers below already surface per-status counts. The <StatsCard>
        component is still exported so this can be re-enabled by uncommenting
        the block below.
      */}
      {/*
      {loading ? (
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-4">
          ...
        </div>
      ) : (
        <StatsCard ... />
      )}
      */}

      {showTour && profile && (
        <PageTour
          tourId="overview"
          userId={profile.id}
          title={t('onboarding.pageTour.overview.title')}
          bullets={[
            t('onboarding.pageTour.overview.bullets.scope'),
            t('onboarding.pageTour.overview.bullets.filter'),
            t('onboarding.pageTour.overview.bullets.drag'),
          ]}
        />
      )}

      <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 pointer-events-none" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('overview.searchPlaceholder')}
            className="w-full rounded-xl border border-input bg-card pl-9 pr-9 py-2 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label={t('overview.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
            // Notes don't have a status lifecycle so they don't fit the
            // kanban view — habits and every other category do.
            .filter(c => c !== 'note')
            .map(cat => {
              const active = activeCategories.has(cat)
              const cfg = CATEGORY_CONFIG[cat]
              return (
                <button key={cat} onClick={() => toggleCategory(cat)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    active
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <span>{cfg.emoji}</span>
                  <span>{t(`category.${cat}`)}</span>
                </button>
              )
            })}
          {activeCategories.size > 0 && (
            <button onClick={() => setActiveCategories(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground ml-1 underline-offset-2 hover:underline">
              {t('overview.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <KanbanSkeleton />
      ) : totalFiltered === 0 ? (
        <EmptyState
          hasFilter={hasFilter}
          range={range}
          onClearFilter={() => { setSearch(''); setActiveCategories(new Set()) }}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
            {PRIMARY_STATUSES.map(status => (
              <StatusColumn
                key={status}
                status={status}
                activities={sortColumn(grouped[status])}
                range={range}
                updatingIds={updatingIds}
                onCycle={handleCycleStatus}
                onDelete={handleDeleteRequest}
                open={openStatuses.has(status)}
                onToggle={() => toggleStatus(status)}
                draggingId={draggingId}
              />
            ))}
          </div>

          {/* Always show secondary droppables when their column is empty? No —
              keep the existing collapse UX. Drops onto Blocked/Skipped require
              expanding the secondary panel first. */}
          {(secondaryCount > 0 || draggingId) && (
            <div className="mt-5 bg-card border border-border rounded-2xl overflow-hidden">
              <button onClick={() => setSecondaryOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3 text-sm">
                  <ChevronDown className={cn('w-4 h-4 transition-transform', !secondaryOpen && '-rotate-90')} />
                  <span className="font-medium">{t('overview.otherStatuses')}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {SECONDARY_STATUSES.map(s => grouped[s].length > 0 && (
                      <span key={s} className="inline-flex items-center gap-1">
                        <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CONFIG[s].dotColor)} />
                        {grouped[s].length} {t(`status.${s}`).toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              {secondaryOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 pt-0">
                  {SECONDARY_STATUSES.map(status => (
                    <StatusColumn
                      key={status}
                      status={status}
                      activities={sortColumn(grouped[status])}
                      range={range}
                      updatingIds={updatingIds}
                      onCycle={handleCycleStatus}
                      onDelete={handleDeleteRequest}
                      open={openStatuses.has(status)}
                      onToggle={() => toggleStatus(status)}
                      compact
                      draggingId={draggingId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {draggingActivity && (
              <div className="rotate-2 shadow-2xl opacity-95">
                <ActivityCard
                  activity={draggingActivity}
                  status={draggingActivity.status}
                  range={range}
                  loading={false}
                  onCycle={() => {}}
                  overlay
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {pendingDelete && profile && (
        <DeleteActivityDialog
          activity={pendingDelete}
          currentUserId={profile.id}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => loadData()}
        />
      )}
    </div>
  )
}

const STATUS_HEX: Record<ActivityStatus, string> = {
  todo:        '#94a3b8',
  in_progress: '#f59e0b',
  done:        '#10b981',
  blocked:     '#ef4444',
  skipped:     '#6b7280',
}

const RING_ORDER: ActivityStatus[] = ['done', 'in_progress', 'todo', 'blocked', 'skipped']
const STAT_ORDER: ActivityStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'skipped']

function StatsCard({
  pct, done, total, totalAll, rangeLabel, grouped, hasFilter,
}: {
  pct: number
  done: number
  total: number
  totalAll: number
  rangeLabel: string
  grouped: Record<ActivityStatus, Activity[]>
  hasFilter: boolean
}) {
  const { t } = useI18n()
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const SEGMENT_GAP = total > 1 ? 1.5 : 0

  let cumulative = 0
  const segments = RING_ORDER
    .map(s => ({ status: s, count: grouped[s].length }))
    .filter(seg => seg.count > 0)
    .map(seg => {
      const fraction = total > 0 ? seg.count / total : 0
      const rawLen = fraction * circumference
      const segmentLength = Math.max(rawLen - SEGMENT_GAP, 0.001)
      const offset = -cumulative
      cumulative += rawLen
      return { ...seg, segmentLength, offset }
    })

  const doneSummary = total === 0
    ? t('overview.noActivitiesPeriod')
    : (done === 1 ? t('overview.doneCountOne') : t('overview.doneCountMany', { count: done }))
      + (hasFilter && totalAll !== total ? t('overview.unfilteredSuffix', { count: totalAll }) : '')

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-4">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} className="text-muted" strokeWidth="7" fill="none" stroke="currentColor" />
            {segments.map(seg => (
              <circle
                key={seg.status}
                cx="40" cy="40" r={radius}
                fill="none"
                stroke={STATUS_HEX[seg.status]}
                strokeWidth="7"
                strokeLinecap="butt"
                strokeDasharray={`${seg.segmentLength} ${circumference - seg.segmentLength}`}
                strokeDashoffset={seg.offset}
                className="transition-[stroke-dashoffset,stroke-dasharray] duration-500"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-base font-bold tabular-nums">{pct}%</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">{t('overview.done')}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm sm:text-base">{rangeLabel}</h2>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none">
            {done}
            <span className="text-base text-muted-foreground font-medium"> / {total}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{doneSummary}</p>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STAT_ORDER.map(s => {
            const count = grouped[s].length
            return (
              <div key={s}
                className={cn(
                  'rounded-xl border border-border/60 px-2.5 py-2 flex flex-col gap-1 transition-opacity',
                  count === 0 && 'opacity-40'
                )}>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_HEX[s] }} />
                  <span className="truncate">{t(`status.${s}`)}</span>
                </span>
                <span className="text-lg font-bold tabular-nums leading-none">{count}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusColumn({
  status, activities, range, updatingIds, onCycle, onDelete, compact, open, onToggle, draggingId,
}: {
  status: ActivityStatus
  activities: Activity[]
  range: 'today' | '7days' | '30days' | '90days'
  updatingIds: Set<string>
  onCycle: (a: Activity) => void
  onDelete: (a: Activity) => void
  compact?: boolean
  open: boolean
  onToggle: () => void
  draggingId: string | null
}) {
  const { t } = useI18n()
  const cfg = STATUS_CONFIG[status]
  const { isOver, setNodeRef } = useDroppable({
    id: `status:${status}`,
    data: { status },
  })
  // Only highlight when a drag is in progress AND the drag would change the
  // status (don't tease the user with a "drop here" hint over the source col).
  const dragSourceStatus = draggingId
    ? activities.some(a => a.id === draggingId) ? status : null
    : null
  const canAccept = !!draggingId && dragSourceStatus !== status
  const showDropHint = canAccept && isOver

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-2xl border bg-card overflow-hidden transition-colors',
        compact && 'shadow-none',
        showDropHint ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        canAccept && !showDropHint && 'border-dashed',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-between px-4 py-2.5 w-full text-left hover:bg-muted/40 transition-colors',
          open && 'border-b border-border/70'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', !open && '-rotate-90')}
          />
          <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dotColor)} />
          <h3 className={cn('text-xs font-semibold uppercase tracking-wider truncate', cfg.textColor)}>
            {t(`status.${status}`)}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">{activities.length}</span>
      </button>
      {open && (
        activities.length === 0 ? (
          <div className={cn(
            'px-4 py-6 text-center text-xs transition-colors',
            showDropHint ? 'text-primary font-medium' : 'text-muted-foreground/70',
          )}>
            {showDropHint ? t('overview.dropHere') : t('overview.noActivitiesStatus')}
          </div>
        ) : (
          <ul className="p-2 space-y-1.5">
            {activities.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                status={status}
                range={range}
                loading={updatingIds.has(a.id)}
                onCycle={() => onCycle(a)}
                onDelete={() => onDelete(a)}
                isDraggingThis={draggingId === a.id}
              />
            ))}
          </ul>
        )
      )}
    </section>
  )
}

function ActivityCard({
  activity, status, range, loading, onCycle, onDelete, isDraggingThis, overlay,
}: {
  activity: Activity
  status: ActivityStatus
  range: 'today' | '7days' | '30days' | '90days'
  loading: boolean
  onCycle: () => void
  /** Omitted on the drag-overlay copy — only the source card gets a working
   *  delete button to avoid duplicate UI floating with the cursor. */
  onDelete?: () => void
  isDraggingThis?: boolean
  overlay?: boolean
}) {
  const { t } = useI18n()
  const fmt = useFormatDate()
  const { formatTime } = useDateTimePrefs()
  const cfg = STATUS_CONFIG[status]
  const catCfg = CATEGORY_CONFIG[activity.category]
  const Icon = STATUS_ICONS[status]
  const showDate = range !== 'today'
  const hasTime = !!activity.start_time
  const isHighPri = activity.priority === 'high' || activity.priority === 'critical'

  // Hook is called unconditionally; we just skip wiring its handlers when
  // this card is the floating overlay (the source card under the cursor
  // already has them).
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({
    id: activity.id,
    data: { from: status },
    disabled: overlay,
  })

  // Drag listeners are attached to the grip handle only — not the whole
  // card — so a touch on the card body still scrolls the Tasks page on
  // mobile. With listeners on the <li>, `touch-action: none` was needed
  // for dnd-kit to detect drags, and that blocked the browser's vertical
  // pan, leaving the kanban list effectively unscrollable on phones.
  const dragProps = overlay ? {} : { ...attributes, ...listeners }

  return (
    <li
      ref={overlay ? undefined : setNodeRef}
      aria-label={overlay ? undefined : t('overview.dragHandle')}
      className={cn(
        // items-stretch so the drag handle column fills the full card
        // height — gives the user a generous Y-axis target. The text
        // content + status circle use self-center to sit mid-card; the
        // category / delete column uses self-start to keep its anchored
        // top-right position.
        'group relative flex items-stretch gap-2.5 p-2.5 rounded-xl border transition-[opacity,box-shadow]',
        cfg.bgColor, cfg.color,
        'hover:shadow-sm',
        // Ghost the original card while it's being dragged — the DragOverlay
        // renders the visible floating copy.
        isDraggingThis && !overlay && 'opacity-30',
      )}
    >
      {isHighPri && (
        <span className={cn(
          'absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full',
          PRIORITY_CONFIG[activity.priority].color.replace('text-', 'bg-')
        )} />
      )}

      {/* Drag handle — the ONLY surface that initiates a drag. Shown on
          every breakpoint so mobile users can still reorder; the rest of
          the card stays scrollable. touch-none on this element only so
          dnd-kit can see the touch sequence without fighting the page
          scroll. */}
      {!overlay && (
        <span
          ref={setActivatorNodeRef}
          {...dragProps}
          aria-label={t('overview.dragHandle')}
          className="touch-none -ml-0.5 shrink-0 w-5 self-stretch flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-background/60 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      )}

      <button
        onClick={onCycle}
        // Stop the pointerdown from reaching the <li>'s drag listeners so the
        // circle stays a click target instead of being swallowed by the drag.
        onPointerDown={e => e.stopPropagation()}
        disabled={loading || overlay}
        className={cn('shrink-0 self-center hover:opacity-70 transition-opacity', cfg.textColor)}
        title={t('overview.changeStatusTitle')}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Icon className="w-4 h-4" />}
      </button>

      <div className="flex-1 min-w-0 self-center">
        <div className="flex items-start gap-1.5">
          {activity.emoji && <span className="shrink-0 leading-tight">{activity.emoji}</span>}
          <span className={cn(
            'text-sm font-medium leading-snug break-words flex-1 min-w-0',
            status === 'done' && 'line-through opacity-60',
            status === 'skipped' && 'opacity-40'
          )}>
            {activity.title}
          </span>
        </div>

        {(hasTime || showDate || activity.goal) && (
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            {hasTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="tabular-nums">{formatTime(activity.start_time)}</span>
              </span>
            )}
            {showDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                {fmt(parseISO(activity.date), 'dayMonthShort')}
              </span>
            )}
            {activity.goal && (
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                <Target className="w-3 h-3 shrink-0" />
                <span className="truncate">{activity.goal.title}</span>
              </span>
            )}
          </div>
        )}

        {activity.description && (
          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{activity.description}</p>
        )}

        {status === 'in_progress' && activity.completion_percentage > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 bg-background/60 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${activity.completion_percentage}%` }} />
            </div>
            <span className="text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              {activity.completion_percentage}%
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 self-start">
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-background/70 border border-border/40',
          catCfg.color
        )}>
          <span className="text-xs leading-none">{catCfg.emoji}</span>
          <span className="hidden md:inline">{t(`category.${activity.category}`)}</span>
        </span>
        {!overlay && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            // Stop the drag listeners from picking up the press — same trick
            // the status circle uses above.
            onPointerDown={e => e.stopPropagation()}
            aria-label={t('common.delete')}
            // Always visible on mobile (no hover state to lean on); fades in
            // on group-hover on desktop so the card stays uncluttered.
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-60 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      {[0, 1, 2].map(col => (
        <div key={col} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
            <div className="h-3 w-24 rounded shimmer" />
            <div className="h-3 w-6 rounded shimmer" />
          </div>
          <div className="p-2 space-y-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-2.5 rounded-xl border border-border/40 space-y-2">
                <div className="h-3.5 rounded shimmer" style={{ width: `${55 + (i * 13) % 35}%` }} />
                <div className="h-2.5 w-24 rounded shimmer" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  hasFilter, range, onClearFilter,
}: {
  hasFilter: boolean
  range: 'today' | '7days' | '30days' | '90days'
  onClearFilter: () => void
}) {
  const { t } = useI18n()
  if (hasFilter) {
    return (
      <div className="bg-card border border-border rounded-2xl py-12 px-4 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-sm text-muted-foreground">{t('overview.emptyFiltered')}</p>
        <button onClick={onClearFilter}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          {t('overview.clearFilters')}
        </button>
      </div>
    )
  }
  return (
    <div className="bg-card border border-border rounded-2xl py-12 px-4 text-center">
      <div className="text-4xl mb-3">✦</div>
      <p className="text-muted-foreground">
        {range === 'today' ? t('overview.emptyToday') : t('overview.emptyPeriod')}
      </p>
      <p className="text-sm text-muted-foreground/70 mt-1">{t('overview.goToCalendar')}</p>
    </div>
  )
}
