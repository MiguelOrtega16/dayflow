'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays } from 'date-fns'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, statusLabel, categoryLabel, getInitials } from '@/lib/utils'
import type { Activity, ActivityStatus, ActivityCategory, Profile } from '@/types'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useI18n, useFormatDate } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { activitiesToCsv, downloadCsv } from '@/lib/csv-export'
import { PageTour } from '@/components/onboarding/page-tour'
import { AdBanner } from '@/components/ads/ad-banner'
import {
  ClipboardList, CheckCircle2, Gauge, Flame, Users, Download, Crown,
  TrendingUp, ArrowUp, ArrowDown, X,
} from 'lucide-react'

const STATUS_HEX: Record<ActivityStatus, string> = {
  todo:        '#94a3b8',
  in_progress: '#f59e0b',
  done:        '#10b981',
  blocked:     '#ef4444',
  skipped:     '#6b7280',
}

const RING_ORDER: ActivityStatus[] = ['done', 'in_progress', 'todo', 'blocked', 'skipped']

// An activity scoped to the current user's perspective. For owned activities
// `myStatus` mirrors `status`; for activities shared *with* the user it holds
// the user's own `participant_status` (their progress), while `status` keeps
// the owner's value so the collaborator card can still show the owner's side.
type ScopedActivity = Activity & { isShared: boolean; myStatus: ActivityStatus }

interface CollabEntry { id: string; title: string; date: string; status: ActivityStatus }
interface Collaborator { profile: Profile; entries: CollabEntry[] }

interface DrillItem {
  id: string
  title: string
  date: string
  status: ActivityStatus
  category?: ActivityCategory
  isShared?: boolean
  ownerName?: string
}
interface Drill { title: string; items: DrillItem[] }

const RANGE_LEN: Record<'week' | 'month' | '3months', number> = { week: 7, month: 30, '3months': 90 }

export default function StatsPage() {
  const { t, locale } = useI18n()
  const [scoped, setScoped]     = useState<ScopedActivity[]>([])
  const [outgoing, setOutgoing] = useState<{ profile: Profile; status: ActivityStatus; activityId: string; date: string; title: string }[]>([])
  const [prevAgg, setPrevAgg]   = useState<{ total: number; done: number } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [range, setRange]       = useState<'week' | 'month' | '3months'>('month')
  const [userId, setUserId]     = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [drill, setDrill]       = useState<Drill | null>(null)
  // Tour gate. Loaded on mount (separate from loadStats so it doesn't refire
  // on every range change). Defaults to false so the tour never flashes
  // before we know whether the user has already dismissed it.
  const [showTour, setShowTour] = useState(false)
  const supabase = createClient()
  const { entitlement } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()

  useEffect(() => { loadStats() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  // One-time preferences read to decide whether to show the page tour.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single()
      if (cancelled) return
      const prefs = (data?.preferences as Record<string, unknown> | null) ?? {}
      setShowTour(prefs.dismissed_tour_stats !== true)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch the user's own + shared-with-me activities for a window, each tagged
  // with the user's effective status (`myStatus`). Used for both the current
  // range and the immediately-preceding window (for period-over-period deltas).
  const fetchScoped = async (uid: string, start: string, end: string): Promise<ScopedActivity[]> => {
    const { data: ownData } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', uid)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    const own: ScopedActivity[] = (ownData || []).map(a => ({
      ...(a as Activity), isShared: false, myStatus: (a as Activity).status,
    }))

    const { data: invitations } = await supabase
      .from('activity_invitations')
      .select('activity_id, participant_status')
      .eq('invitee_id', uid)
      .eq('status', 'accepted')

    let shared: ScopedActivity[] = []
    if (invitations && invitations.length > 0) {
      const ids = invitations.map(i => i.activity_id)
      const psById = new Map<string, ActivityStatus>(
        invitations.map(i => [i.activity_id as string, (i.participant_status as ActivityStatus)]),
      )
      const { data: invited } = await supabase
        .from('activities')
        .select('*, profile:profiles(*)')
        .in('id', ids)
        .gte('date', start)
        .lte('date', end)
      shared = (invited || []).map(a => ({
        ...(a as Activity),
        isShared: true,
        // The user's progress on the shared activity, not the owner's.
        myStatus: psById.get((a as Activity).id) ?? (a as Activity).status,
      }))
    }

    // Dedup by id (an owned record should never also appear as shared, but guard).
    const seen = new Set<string>()
    const out: ScopedActivity[] = []
    for (const a of [...own, ...shared]) {
      if (!seen.has(a.id)) { seen.add(a.id); out.push(a) }
    }
    return out
  }

  const loadStats = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const len   = RANGE_LEN[range]
    const today = new Date()
    const curEnd    = format(today, 'yyyy-MM-dd')
    const curStart  = format(subDays(today, len - 1), 'yyyy-MM-dd')
    const prevEnd   = format(subDays(today, len), 'yyyy-MM-dd')
    const prevStart = format(subDays(today, len * 2 - 1), 'yyyy-MM-dd')

    const cur = await fetchScoped(user.id, curStart, curEnd)
    setScoped(cur)

    // Outgoing collaborators: accepted invitees on the user's OWN activities.
    // This is the half the breakdown used to miss — people the user shared TO.
    const ownIds = cur.filter(a => !a.isShared).map(a => a.id)
    if (ownIds.length > 0) {
      const { data: outRows } = await supabase
        .from('activity_invitations')
        .select('activity_id, participant_status, invitee:profiles!activity_invitations_invitee_id_fkey(*)')
        .in('activity_id', ownIds)
        .eq('status', 'accepted')
      const byId = new Map(cur.map(a => [a.id, a]))
      setOutgoing((outRows || [])
        .filter(r => (r as any).invitee)
        .map(r => {
          const act = byId.get((r as any).activity_id)
          return {
            profile:    (r as any).invitee as Profile,
            status:     (r as any).participant_status as ActivityStatus,
            activityId: (r as any).activity_id as string,
            date:       act?.date ?? '',
            title:      act?.title ?? '',
          }
        }))
    } else {
      setOutgoing([])
    }

    // Previous window — only aggregate counts are needed for KPI deltas.
    const prev = await fetchScoped(user.id, prevStart, prevEnd)
    setPrevAgg({ total: prev.length, done: prev.filter(a => a.myStatus === 'done').length })

    setLoading(false)
  }

  const agg = useMemo(() => {
    const own    = scoped.filter(a => !a.isShared)
    const shared = scoped.filter(a => a.isShared)

    const total = scoped.length
    const done  = scoped.filter(a => a.myStatus === 'done').length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

    const ownTotal = own.length
    const ownDone  = own.filter(a => a.myStatus === 'done').length
    const ownRate  = ownTotal > 0 ? Math.round((ownDone / ownTotal) * 100) : 0

    const sharedTotal = shared.length
    const sharedDone  = shared.filter(a => a.myStatus === 'done').length
    const sharedRate  = sharedTotal > 0 ? Math.round((sharedDone / sharedTotal) * 100) : 0

    // Category breakdown now carries a completion rate, not just volume.
    const byCategory = (Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
      .map(cat => {
        const inCat = scoped.filter(a => a.category === cat)
        const cdone = inCat.filter(a => a.myStatus === 'done').length
        return { cat, count: inCat.length, done: cdone, rate: inCat.length > 0 ? Math.round((cdone / inCat.length) * 100) : 0 }
      })
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)

    const statusCounts: Record<ActivityStatus, number> = {
      todo:        scoped.filter(a => a.myStatus === 'todo').length,
      in_progress: scoped.filter(a => a.myStatus === 'in_progress').length,
      done,
      blocked:     scoped.filter(a => a.myStatus === 'blocked').length,
      skipped:     scoped.filter(a => a.myStatus === 'skipped').length,
    }

    // Completion trend — done count per day across the selected window.
    const len = RANGE_LEN[range]
    const today = new Date()
    const days = Array.from({ length: len }, (_, i) => format(subDays(today, len - 1 - i), 'yyyy-MM-dd'))
    const doneByDate: Record<string, number> = {}
    for (const a of scoped) if (a.myStatus === 'done') doneByDate[a.date] = (doneByDate[a.date] || 0) + 1
    const trend = days.map(d => ({ date: d, done: doneByDate[d] || 0 }))

    let streak = 0
    let d = new Date()
    while (streak <= 365) {
      const key = format(d, 'yyyy-MM-dd')
      const hasActivity = scoped.some(a => a.date === key && a.myStatus === 'done')
      if (!hasActivity) break
      streak++
      d = subDays(d, 1)
    }

    // Bidirectional collaborators. Incoming: activities others shared with me
    // (collaborator = owner, status = owner's). Outgoing: my activities I shared
    // out (collaborator = invitee, status = their participant_status).
    const map: Record<string, Collaborator> = {}
    const addEntry = (profile: Profile | undefined, entry: CollabEntry) => {
      if (!profile) return
      if (!map[profile.id]) map[profile.id] = { profile, entries: [] }
      map[profile.id].entries.push(entry)
    }
    for (const a of shared) {
      addEntry(a.profile, { id: a.id, title: a.title, date: a.date, status: a.status })
    }
    for (const o of outgoing) {
      addEntry(o.profile, { id: o.activityId, title: o.title, date: o.date, status: o.status })
    }
    const collaborators = Object.values(map).sort((a, b) => b.entries.length - a.entries.length)

    return {
      total, done, completionRate, ownTotal, ownDone, ownRate,
      sharedTotal, sharedDone, sharedRate, collaborators, byCategory,
      statusCounts, streak, trend,
    }
  }, [scoped, outgoing, range])

  const {
    total, done, completionRate, ownTotal, ownDone, ownRate,
    sharedTotal, sharedDone, sharedRate, collaborators, byCategory,
    statusCounts, streak, trend,
  } = agg

  // KPI deltas vs the immediately-preceding window of the same length.
  const prevRate = prevAgg && prevAgg.total > 0 ? Math.round((prevAgg.done / prevAgg.total) * 100) : 0
  const hasPrev  = !!prevAgg && prevAgg.total > 0
  const totalDelta = hasPrev ? total - prevAgg!.total : null
  const doneDelta  = hasPrev ? done - prevAgg!.done : null
  const rateDelta  = hasPrev ? completionRate - prevRate : null

  const rangeLabel = (r: typeof range) => t(`stats.ranges.${r}`)

  // Open the drill-in modal with the activities in a given status.
  const drillStatus = (s: ActivityStatus) => {
    const items: DrillItem[] = scoped
      .filter(a => a.myStatus === s)
      .map(a => ({
        id: a.id, title: a.title, date: a.date, status: a.myStatus,
        category: a.category, isShared: a.isShared,
        ownerName: a.isShared ? (a.profile?.full_name || a.profile?.email || undefined) : undefined,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
    setDrill({ title: statusLabel(s, locale), items })
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const allActivitiesForRange = useMemo(() => {
    return [...scoped]
      // Export the user's effective status so the file matches what's on screen.
      .map(a => ({ ...a, status: a.myStatus }) as Activity)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [scoped])

  const handleExport = async () => {
    if (!entitlement.isPro) {
      openPaywall('stats_export')
      return
    }
    if (allActivitiesForRange.length === 0) return
    setExporting(true)
    try {
      // An activity is "shared" if it has ANY invitations attached, regardless
      // of acceptance — the user's intent of sharing is what matters here.
      const sharedActivityIds = new Set<string>()
      const allIds = allActivitiesForRange.map(a => a.id)
      if (allIds.length > 0) {
        const { data: invs } = await supabase
          .from('activity_invitations')
          .select('activity_id')
          .in('activity_id', allIds)
        for (const row of invs ?? []) sharedActivityIds.add(row.activity_id)
      }

      const categoryLabels = (Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
        .reduce((acc, c) => { acc[c] = categoryLabel(c, locale); return acc }, {} as Record<ActivityCategory, string>)
      const statusLabels = (Object.keys(STATUS_CONFIG) as ActivityStatus[])
        .reduce((acc, s) => { acc[s] = statusLabel(s, locale); return acc }, {} as Record<ActivityStatus, string>)
      const csv = activitiesToCsv(allActivitiesForRange, {
        date:        t('stats.export.columns.date'),
        title:       t('stats.export.columns.title'),
        description: t('stats.export.columns.description'),
        category:    t('stats.export.columns.category'),
        status:      t('stats.export.columns.status'),
        startTime:   t('stats.export.columns.startTime'),
        endTime:     t('stats.export.columns.endTime'),
        completion:  t('stats.export.columns.completion'),
        goal:        t('stats.export.columns.goal'),
        recurrence:  t('stats.export.columns.recurrence'),
        isShared:    t('stats.export.columns.isShared'),
        yes:         t('common.yes'),
        no:          t('common.no'),
        createdAt:   t('stats.export.columns.createdAt'),
        categoryLabels,
        statusLabels,
      }, sharedActivityIds)
      const filename = `${t('stats.export.filename', { range })}.csv`
      downloadCsv(csv, filename)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded-xl w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto space-y-4">
      <AdBanner />
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl sm:text-2xl font-semibold">{t('stats.title')}</h1>
            <InfoTooltip text={t('stats.info')} />
          </div>
          <p className="text-sm text-muted-foreground">{t('stats.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center bg-muted rounded-xl p-1 flex-1 sm:flex-initial">
            {(['week', 'month', '3months'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn(
                  'flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-center',
                  range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}>
                {rangeLabel(r)}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || allActivitiesForRange.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors shrink-0',
              entitlement.isPro
                ? 'border-border text-foreground hover:bg-muted'
                : 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/5',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title={allActivitiesForRange.length === 0 ? t('stats.export.empty') : undefined}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? t('stats.export.exporting') : t('stats.export.button')}</span>
            {!entitlement.isPro && <Crown className="w-3.5 h-3.5 text-indigo-500" />}
          </button>
        </div>
      </div>

      {showTour && userId && (
        <PageTour
          tourId="stats"
          userId={userId}
          title={t('onboarding.pageTour.stats.title')}
          bullets={[
            t('onboarding.pageTour.stats.bullets.kpis'),
            t('onboarding.pageTour.stats.bullets.breakdown'),
            t('onboarding.pageTour.stats.bullets.export'),
          ]}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<ClipboardList className="w-4 h-4" />} label={t('stats.kpis.total')} value={total} accent="primary"
          delta={totalDelta} />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4" />}  label={t('stats.kpis.done')}  value={done} accent="emerald"
          delta={doneDelta} />
        <KpiCard
          icon={<Gauge className="w-4 h-4" />}
          label={t('stats.kpis.rate')}
          value={`${completionRate}%`}
          accent="indigo"
          progress={completionRate}
          delta={rateDelta}
          deltaSuffix="%"
        />
        <KpiCard
          icon={<Flame className="w-4 h-4" />}
          label={t('stats.kpis.streak')}
          value={streak === 1 ? t('stats.kpis.oneDay') : t('stats.kpis.manyDays', { count: streak })}
          accent="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatusBreakdownCard total={total} statusCounts={statusCounts} sharedTotal={sharedTotal} onPick={drillStatus} />
        <CategoryBreakdownCard total={total} byCategory={byCategory} />
        <OwnVsSharedCard
          ownTotal={ownTotal} ownDone={ownDone} ownRate={ownRate}
          sharedTotal={sharedTotal} sharedDone={sharedDone} sharedRate={sharedRate}
          total={total}
        />
      </div>

      <TrendCard trend={trend} />

      {collaborators.length > 0 && (
        <CollaboratorsCard collaborators={collaborators} onPick={(c, s, items) => setDrill({ title: `${c} · ${statusLabel(s, locale)}`, items })} />
      )}

      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}

const ACCENT_BG: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
}

function KpiCard({
  icon, label, value, accent, progress, delta, deltaSuffix,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  accent: 'primary' | 'emerald' | 'indigo' | 'orange'
  progress?: number
  /** Difference vs the previous window. null = no comparable previous data. */
  delta?: number | null
  deltaSuffix?: string
}) {
  const { t } = useI18n()
  const showDelta = typeof delta === 'number'
  const tone = !showDelta ? '' : delta! > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : delta! < 0 ? 'text-red-500' : 'text-muted-foreground'
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', ACCENT_BG[accent])}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight">{value}</div>
      {showDelta && (
        <div className="flex items-center gap-1 text-[11px] -mt-1">
          <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', tone)}>
            {delta! > 0 ? <ArrowUp className="w-3 h-3" /> : delta! < 0 ? <ArrowDown className="w-3 h-3" /> : null}
            {delta! > 0 ? '+' : ''}{delta}{deltaSuffix ?? ''}
          </span>
          <span className="text-muted-foreground/70">{t('stats.delta.vsPrev')}</span>
        </div>
      )}
      {typeof progress === 'number' && (
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-current rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, color: 'hsl(var(--primary))' }} />
        </div>
      )}
    </div>
  )
}

function StatusBreakdownCard({
  total, statusCounts, sharedTotal, onPick,
}: {
  total: number
  statusCounts: Record<ActivityStatus, number>
  sharedTotal: number
  onPick: (s: ActivityStatus) => void
}) {
  const { t } = useI18n()
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const SEGMENT_GAP = total > 1 ? 1.5 : 0

  let cumulative = 0
  const segments = RING_ORDER
    .map(s => ({ status: s, count: statusCounts[s] }))
    .filter(seg => seg.count > 0)
    .map(seg => {
      const fraction = seg.count / total
      const rawLen = fraction * circumference
      const segmentLength = Math.max(rawLen - SEGMENT_GAP, 0.001)
      const offset = -cumulative
      cumulative += rawLen
      return { ...seg, segmentLength, offset }
    })

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold">{t('stats.cards.byStatus')}</h2>
        {sharedTotal > 0 && (
          <span className="text-[10px] text-muted-foreground/70 shrink-0">{t('stats.cards.includesShared')}</span>
        )}
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stats.empty')}</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={radius} className="text-muted" strokeWidth="7" fill="none" stroke="currentColor" />
                {segments.map(seg => (
                  <circle
                    key={seg.status}
                    cx="40" cy="40" r={radius}
                    fill="none" stroke={STATUS_HEX[seg.status]}
                    strokeWidth="7" strokeLinecap="butt"
                    strokeDasharray={`${seg.segmentLength} ${circumference - seg.segmentLength}`}
                    strokeDashoffset={seg.offset}
                    className="transition-[stroke-dashoffset,stroke-dasharray] duration-500 cursor-pointer hover:opacity-80"
                    onClick={() => onPick(seg.status)}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none pointer-events-none">
                <span className="text-xl font-bold tabular-nums">{total}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{t('stats.cards.total')}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
              {RING_ORDER.map(s =>
                statusCounts[s] > 0 ? (
                  <button key={s} onClick={() => onPick(s)}
                    className="flex items-center gap-2 text-xs -mx-1 px-1 py-0.5 rounded-md hover:bg-muted/60 transition-colors text-left">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_HEX[s] }} />
                    <span className="truncate text-muted-foreground flex-1">{t(`status.${s}`)}</span>
                    <span className="tabular-nums font-medium">{statusCounts[s]}</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground w-9 text-right">
                      {Math.round((statusCounts[s] / total) * 100)}%
                    </span>
                  </button>
                ) : null
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CategoryBreakdownCard({
  total, byCategory,
}: {
  total: number
  byCategory: { cat: string; count: number; done: number; rate: number }[]
}) {
  const { t } = useI18n()
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col">
      <h2 className="text-sm font-semibold mb-3">{t('stats.cards.byCategory')}</h2>
      {byCategory.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stats.empty')}</p>
      ) : (
        <div className="space-y-2.5 flex-1">
          {byCategory.map(({ cat, count, done, rate }) => {
            const cfg = CATEGORY_CONFIG[cat as ActivityCategory]
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                  <span className="flex items-center gap-1.5 truncate">
                    <span>{cfg.emoji}</span>
                    <span className="truncate">{t(`category.${cat as ActivityCategory}`)}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0 flex items-center gap-1.5">
                    <span>{count} <span className="text-[10px]">· {Math.round(pct)}%</span></span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400"
                      title={t('stats.cards.catCompletion', { done, count })}>
                      ✓ {rate}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
                  {/* Volume share (faint) with completed portion (solid) on top. */}
                  <div className="absolute inset-y-0 left-0 bg-primary/25 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${(pct * rate) / 100}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OwnVsSharedCard({
  ownTotal, ownDone, ownRate, sharedTotal, sharedDone, sharedRate, total,
}: {
  ownTotal: number; ownDone: number; ownRate: number
  sharedTotal: number; sharedDone: number; sharedRate: number
  total: number
}) {
  const { t } = useI18n()
  const ownPct    = total > 0 ? Math.round((ownTotal / total) * 100) : 0
  const sharedPct = total > 0 ? Math.round((sharedTotal / total) * 100) : 0

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col">
      <h2 className="text-sm font-semibold mb-3">{t('stats.cards.ownVsShared')}</h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stats.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 flex-1">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs font-medium text-muted-foreground">{t('stats.cards.own')}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none">{ownTotal}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {t('stats.cards.donePct', { done: ownDone, rate: ownRate })}
              </div>
              {ownTotal > 0 && (
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${ownRate}%` }} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-xs font-medium text-muted-foreground">{t('stats.cards.shared')}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none">{sharedTotal}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {sharedTotal > 0
                  ? t('stats.cards.donePct', { done: sharedDone, rate: sharedRate })
                  : t('stats.cards.none')}
              </div>
              {sharedTotal > 0 && (
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${sharedRate}%` }} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>{t('stats.cards.ownPct', { pct: ownPct })}</span>
              <span>{t('stats.cards.sharedPct', { pct: sharedPct })}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${ownPct}%` }} />
              <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${sharedPct}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TrendCard({ trend }: { trend: { date: string; done: number }[] }) {
  const { t } = useI18n()
  const fmt = useFormatDate()
  const max = Math.max(1, ...trend.map(d => d.done))
  const totalDone = trend.reduce((s, d) => s + d.done, 0)
  const first = trend[0]?.date
  const last  = trend[trend.length - 1]?.date

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          {t('stats.trend.heading')}
        </h2>
        <span className="text-xs text-muted-foreground">{t('stats.trend.subtitle')}</span>
      </div>
      {totalDone === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stats.trend.empty')}</p>
      ) : (
        <>
          <div className="flex items-end gap-px h-24">
            {trend.map(d => (
              <div
                key={d.date}
                className="flex-1 min-w-0 bg-muted/40 rounded-sm flex items-end overflow-hidden"
                title={t('stats.trend.tooltip', { count: d.done, date: fmt(new Date(d.date + 'T12:00:00'), 'dayMonthShort') })}
              >
                <div
                  className="w-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors rounded-sm"
                  style={{ height: `${d.done === 0 ? 0 : Math.max(8, (d.done / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          {first && last && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 mt-1.5 tabular-nums">
              <span>{fmt(new Date(first + 'T12:00:00'), 'dayMonthShort')}</span>
              <span>{fmt(new Date(last + 'T12:00:00'), 'dayMonthShort')}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CollaboratorsCard({
  collaborators, onPick,
}: {
  collaborators: Collaborator[]
  onPick: (collaboratorName: string, status: ActivityStatus, items: DrillItem[]) => void
}) {
  const { t } = useI18n()
  const fmt = useFormatDate()
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          {t('stats.collab.heading')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {collaborators.length === 1
            ? t('stats.collab.peopleOne', { count: 1 })
            : t('stats.collab.peopleMany', { count: collaborators.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {collaborators.map(({ profile, entries }) => {
          const name      = profile.full_name || profile.email
          const colDone   = entries.filter(a => a.status === 'done').length
          const colRate   = entries.length > 0 ? Math.round((colDone / entries.length) * 100) : 0
          const colByStatus = (Object.keys(STATUS_CONFIG) as ActivityStatus[])
            .map(s => ({ status: s, count: entries.filter(a => a.status === s).length }))
            .filter(s => s.count > 0)
          const mostRecentDate = entries.map(a => a.date).filter(Boolean).sort().reverse()[0]

          return (
            <div key={profile.id} className="rounded-xl border border-border/60 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: profile.color || '#6366f1' }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                    : getInitials(profile.full_name, profile.email).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold truncate">{name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {entries.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${colRate}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">{colRate}%</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {colByStatus.map(({ status, count }) => {
                      const cfg = STATUS_CONFIG[status]
                      return (
                        <button key={status}
                          onClick={() => onPick(name, status, entries
                            .filter(e => e.status === status)
                            .map(e => ({ id: e.id, title: e.title, date: e.date, status: e.status }))
                            .sort((a, b) => b.date.localeCompare(a.date)))}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity', cfg.bgColor, cfg.textColor)}>
                          {count} {t(`status.${status}`)}
                        </button>
                      )
                    })}
                  </div>
                  {mostRecentDate && (
                    <p className="text-[10px] text-muted-foreground/60 mt-2">
                      {t('stats.collab.lastActivity', { date: fmt(new Date(mostRecentDate + 'T12:00:00'), 'dayMonthLong') })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const { t } = useI18n()
  const fmt = useFormatDate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {drill.title}
            <span className="text-xs text-muted-foreground tabular-nums">{drill.items.length}</span>
          </h3>
          <button onClick={onClose} aria-label={t('stats.drill.close')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {drill.items.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">{t('stats.drill.empty')}</p>
          ) : (
            <ul className="space-y-1">
              {drill.items.map(item => {
                const catCfg = item.category ? CATEGORY_CONFIG[item.category] : null
                return (
                  <li key={item.id} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/50">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: STATUS_HEX[item.status] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {catCfg && <span className="text-xs shrink-0">{catCfg.emoji}</span>}
                        <span className="text-sm font-medium truncate">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {item.date && <span className="tabular-nums">{fmt(new Date(item.date + 'T12:00:00'), 'dayMonthShort')}</span>}
                        {item.isShared && (
                          <span className="inline-flex items-center gap-1 text-violet-500">
                            <span className="w-1 h-1 rounded-full bg-violet-500" />
                            {item.ownerName ? t('stats.drill.from', { name: item.ownerName }) : t('stats.drill.shared')}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
