'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, parseISO } from 'date-fns'
import { getActivitiesForRange, updateActivityStatus } from '@/lib/api'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, PRIORITY_CONFIG, formatTime } from '@/lib/utils'
import type { Activity, ActivityStatus, ActivityCategory, Profile } from '@/types'
import {
  CheckCircle2, Circle, Play, Ban, SkipForward, Loader2,
  Search, ChevronDown, Clock, Target, Calendar as CalendarIcon, X,
} from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useI18n, useFormatDate } from '@/lib/i18n'
import { BillingDebugButton } from '@/components/billing-debug-button'

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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | '7days' | '30days' | '90days'>('today')
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
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
  const supabase = createClient()

  useEffect(() => { setLoading(true); loadData() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)
    const today = format(new Date(), 'yyyy-MM-dd')
    const days = range === '7days' ? 6 : range === '30days' ? 29 : range === '90days' ? 89 : 0
    const start = format(subDays(new Date(), days), 'yyyy-MM-dd')
    const data = await getActivitiesForRange(start, today, [user.id], user.id)
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
            .filter(c => c !== 'habit' && c !== 'note')
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
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
            {PRIMARY_STATUSES.map(status => (
              <StatusColumn
                key={status}
                status={status}
                activities={sortColumn(grouped[status])}
                range={range}
                updatingIds={updatingIds}
                onCycle={handleCycleStatus}
                open={openStatuses.has(status)}
                onToggle={() => toggleStatus(status)}
              />
            ))}
          </div>

          {secondaryCount > 0 && (
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
                  {SECONDARY_STATUSES.map(status =>
                    grouped[status].length > 0 ? (
                      <StatusColumn
                        key={status}
                        status={status}
                        activities={sortColumn(grouped[status])}
                        range={range}
                        updatingIds={updatingIds}
                        onCycle={handleCycleStatus}
                        open={openStatuses.has(status)}
                        onToggle={() => toggleStatus(status)}
                        compact
                      />
                    ) : null
                  )}
                </div>
              )}
            </div>
          )}
        </>
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
  status, activities, range, updatingIds, onCycle, compact, open, onToggle,
}: {
  status: ActivityStatus
  activities: Activity[]
  range: 'today' | '7days' | '30days' | '90days'
  updatingIds: Set<string>
  onCycle: (a: Activity) => void
  compact?: boolean
  open: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const cfg = STATUS_CONFIG[status]
  return (
    <section className={cn(
      'flex flex-col rounded-2xl border border-border bg-card overflow-hidden',
      compact && 'shadow-none'
    )}>
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
          <div className="px-4 py-6 text-center text-xs text-muted-foreground/70">
            {t('overview.noActivitiesStatus')}
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
              />
            ))}
          </ul>
        )
      )}
    </section>
  )
}

function ActivityCard({
  activity, status, range, loading, onCycle,
}: {
  activity: Activity
  status: ActivityStatus
  range: 'today' | '7days' | '30days' | '90days'
  loading: boolean
  onCycle: () => void
}) {
  const { t } = useI18n()
  const fmt = useFormatDate()
  const cfg = STATUS_CONFIG[status]
  const catCfg = CATEGORY_CONFIG[activity.category]
  const Icon = STATUS_ICONS[status]
  const showDate = range !== 'today'
  const hasTime = !!activity.start_time
  const isHighPri = activity.priority === 'high' || activity.priority === 'critical'

  return (
    <li className={cn(
      'group relative flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors',
      cfg.bgColor, cfg.color,
      'hover:shadow-sm'
    )}>
      {isHighPri && (
        <span className={cn(
          'absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full',
          PRIORITY_CONFIG[activity.priority].color.replace('text-', 'bg-')
        )} />
      )}

      <button
        onClick={onCycle}
        disabled={loading}
        className={cn('mt-0.5 shrink-0 hover:opacity-70 transition-opacity', cfg.textColor)}
        title={t('overview.changeStatusTitle')}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Icon className="w-4 h-4" />}
      </button>

      <div className="flex-1 min-w-0">
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

      <span className={cn(
        'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-background/70 border border-border/40',
        catCfg.color
      )}>
        <span className="text-xs leading-none">{catCfg.emoji}</span>
        <span className="hidden md:inline">{t(`category.${activity.category}`)}</span>
      </span>
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
