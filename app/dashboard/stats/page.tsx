'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays } from 'date-fns'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, getInitials } from '@/lib/utils'
import type { Activity, ActivityStatus, ActivityCategory, Profile } from '@/types'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useI18n, useFormatDate } from '@/lib/i18n'
import {
  ClipboardList, CheckCircle2, Gauge, Flame, Users,
} from 'lucide-react'

const STATUS_HEX: Record<ActivityStatus, string> = {
  todo:        '#94a3b8',
  in_progress: '#f59e0b',
  done:        '#10b981',
  blocked:     '#ef4444',
  skipped:     '#6b7280',
}

const RING_ORDER: ActivityStatus[] = ['done', 'in_progress', 'todo', 'blocked', 'skipped']

interface Collaborator {
  profile: Profile
  activities: Activity[]
}

export default function StatsPage() {
  const { t } = useI18n()
  const [ownActivities, setOwnActivities]         = useState<Activity[]>([])
  const [invitedActivities, setInvitedActivities] = useState<Activity[]>([])
  const [loading, setLoading]                     = useState(true)
  const [range, setRange]                         = useState<'week' | 'month' | '3months'>('month')
  const supabase = createClient()

  useEffect(() => { loadStats() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const loadStats = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date()
    const endDate = format(today, 'yyyy-MM-dd')
    const startDate = format(
      subDays(today, range === 'week' ? 6 : range === 'month' ? 29 : 89),
      'yyyy-MM-dd'
    )

    const { data: ownData } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    setOwnActivities((ownData || []) as Activity[])

    const { data: invitations } = await supabase
      .from('activity_invitations')
      .select('activity_id')
      .eq('invitee_id', user.id)
      .eq('status', 'accepted')

    if (invitations && invitations.length > 0) {
      const ids = invitations.map(i => i.activity_id)
      const { data: invited } = await supabase
        .from('activities')
        .select('*, profile:profiles(*)')
        .in('id', ids)
        .gte('date', startDate)
        .lte('date', endDate)
      setInvitedActivities((invited || []) as Activity[])
    } else {
      setInvitedActivities([])
    }

    setLoading(false)
  }

  const { total, done, completionRate, ownTotal, ownDone, ownRate,
          sharedTotal, sharedDone, sharedRate, collaborators, byCategory,
          byStatus, statusCounts, streak } = useMemo(() => {
    const allIds = new Set<string>()
    const activities: Activity[] = []
    for (const a of [...ownActivities, ...invitedActivities]) {
      if (!allIds.has(a.id)) { allIds.add(a.id); activities.push(a) }
    }

    const total = activities.length
    const done  = activities.filter(a => a.status === 'done').length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

    const ownTotal = ownActivities.length
    const ownDone  = ownActivities.filter(a => a.status === 'done').length
    const ownRate  = ownTotal > 0 ? Math.round((ownDone / ownTotal) * 100) : 0

    const sharedTotal = invitedActivities.length
    const sharedDone  = invitedActivities.filter(a => a.status === 'done').length
    const sharedRate  = sharedTotal > 0 ? Math.round((sharedDone / sharedTotal) * 100) : 0

    const collaboratorMap: Record<string, Collaborator> = {}
    for (const act of invitedActivities) {
      const profile = act.profile as Profile | undefined
      if (!profile) continue
      if (!collaboratorMap[profile.id]) collaboratorMap[profile.id] = { profile, activities: [] }
      collaboratorMap[profile.id].activities.push(act)
    }
    const collaborators = Object.values(collaboratorMap)
      .sort((a, b) => b.activities.length - a.activities.length)

    const byCategory = (Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
      .map(cat => ({ cat, count: activities.filter(a => a.category === cat).length }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)

    const byStatus = (Object.keys(STATUS_CONFIG) as ActivityStatus[])
      .map(s => ({ status: s, count: activities.filter(a => a.status === s).length }))
      .filter(s => s.count > 0)

    const statusCounts: Record<ActivityStatus, number> = {
      todo:        activities.filter(a => a.status === 'todo').length,
      in_progress: activities.filter(a => a.status === 'in_progress').length,
      done,
      blocked:     activities.filter(a => a.status === 'blocked').length,
      skipped:     activities.filter(a => a.status === 'skipped').length,
    }

    let streak = 0
    let d = new Date()
    while (streak <= 365) {
      const hasActivity = activities.some(a => a.date === format(d, 'yyyy-MM-dd') && a.status === 'done')
      if (!hasActivity) break
      streak++
      d = subDays(d, 1)
    }

    return { total, done, completionRate, ownTotal, ownDone, ownRate,
             sharedTotal, sharedDone, sharedRate, collaborators, byCategory,
             byStatus, statusCounts, streak }
  }, [ownActivities, invitedActivities])

  const rangeLabel = (r: typeof range) => t(`stats.ranges.${r}`)

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
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl sm:text-2xl font-semibold">{t('stats.title')}</h1>
            <InfoTooltip text={t('stats.info')} />
          </div>
          <p className="text-sm text-muted-foreground">{t('stats.subtitle')}</p>
        </div>
        <div className="flex items-center bg-muted rounded-xl p-1 w-full sm:w-auto sm:shrink-0">
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
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<ClipboardList className="w-4 h-4" />} label={t('stats.kpis.total')} value={total} accent="primary" />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4" />}  label={t('stats.kpis.done')}  value={done} accent="emerald" />
        <KpiCard
          icon={<Gauge className="w-4 h-4" />}
          label={t('stats.kpis.rate')}
          value={`${completionRate}%`}
          accent="indigo"
          progress={completionRate}
        />
        <KpiCard
          icon={<Flame className="w-4 h-4" />}
          label={t('stats.kpis.streak')}
          value={streak === 1 ? t('stats.kpis.oneDay') : t('stats.kpis.manyDays', { count: streak })}
          accent="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatusBreakdownCard total={total} statusCounts={statusCounts} byStatus={byStatus} />
        <CategoryBreakdownCard total={total} byCategory={byCategory} />
        <OwnVsSharedCard
          ownTotal={ownTotal} ownDone={ownDone} ownRate={ownRate}
          sharedTotal={sharedTotal} sharedDone={sharedDone} sharedRate={sharedRate}
          total={total}
        />
      </div>

      {collaborators.length > 0 && (
        <CollaboratorsCard collaborators={collaborators} />
      )}
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
  icon, label, value, accent, progress,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  accent: 'primary' | 'emerald' | 'indigo' | 'orange'
  progress?: number
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', ACCENT_BG[accent])}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight">{value}</div>
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
  total, statusCounts,
}: {
  total: number
  statusCounts: Record<ActivityStatus, number>
  byStatus: { status: ActivityStatus; count: number }[]
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
      <h2 className="text-sm font-semibold mb-3">{t('stats.cards.byStatus')}</h2>
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
                    className="transition-[stroke-dashoffset,stroke-dasharray] duration-500"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-xl font-bold tabular-nums">{total}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{t('stats.cards.total')}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
              {RING_ORDER.map(s =>
                statusCounts[s] > 0 ? (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_HEX[s] }} />
                    <span className="truncate text-muted-foreground flex-1">{t(`status.${s}`)}</span>
                    <span className="tabular-nums font-medium">{statusCounts[s]}</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground w-9 text-right">
                      {Math.round((statusCounts[s] / total) * 100)}%
                    </span>
                  </div>
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
  byCategory: { cat: string; count: number }[]
}) {
  const { t } = useI18n()
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col">
      <h2 className="text-sm font-semibold mb-3">{t('stats.cards.byCategory')}</h2>
      {byCategory.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stats.empty')}</p>
      ) : (
        <div className="space-y-2.5 flex-1">
          {byCategory.map(({ cat, count }) => {
            const cfg = CATEGORY_CONFIG[cat as ActivityCategory]
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                  <span className="flex items-center gap-1.5 truncate">
                    <span>{cfg.emoji}</span>
                    <span className="truncate">{t(`category.${cat as ActivityCategory}`)}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {count} <span className="text-[10px]">· {Math.round(pct)}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
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

function CollaboratorsCard({ collaborators }: { collaborators: Collaborator[] }) {
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
        {collaborators.map(({ profile, activities: colActs }) => {
          const colDone   = colActs.filter(a => a.status === 'done').length
          const colRate   = colActs.length > 0 ? Math.round((colDone / colActs.length) * 100) : 0
          const colByStatus = (Object.keys(STATUS_CONFIG) as ActivityStatus[])
            .map(s => ({ status: s, count: colActs.filter(a => a.status === s).length }))
            .filter(s => s.count > 0)
          const mostRecentDate = colActs.map(a => a.date).sort().reverse()[0]

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
                    <span className="text-sm font-semibold truncate">
                      {profile.full_name || profile.email}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {colActs.length}
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
                        <span key={status}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', cfg.bgColor, cfg.textColor)}>
                          {count} {t(`status.${status}`)}
                        </span>
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
