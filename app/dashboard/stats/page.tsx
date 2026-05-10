'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG, getInitials } from '@/lib/utils'
import type { Activity, Profile } from '@/types'
import { InfoTooltip } from '@/components/ui/info-tooltip'

// Solid colors for progress bars (can't use Tailwind classes in inline styles)
const STATUS_BAR_COLOR: Record<string, string> = {
  done:        '#22c55e',
  in_progress: '#f59e0b',
  blocked:     '#ef4444',
  skipped:     '#9ca3af',
  todo:        '#94a3b8',
}

interface Collaborator {
  profile: Profile
  activities: Activity[]
}

export default function StatsPage() {
  const [ownActivities, setOwnActivities]         = useState<Activity[]>([])
  const [invitedActivities, setInvitedActivities] = useState<Activity[]>([])
  const [loading, setLoading]                     = useState(true)
  const [range, setRange]                         = useState<'week' | 'month' | '3months'>('month')
  const supabase = createClient()

  useEffect(() => { loadStats() }, [range])

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

    // Own activities
    const { data: ownData } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    setOwnActivities((ownData || []) as Activity[])

    // Accepted invitations → fetch with owner profile for collaborator section
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

  // ── Derived ────────────────────────────────────────────────────────────────
  // Deduplicate in the rare case the user both owns and was invited to the same activity
  const allIds = new Set<string>()
  const activities: Activity[] = []
  for (const a of [...ownActivities, ...invitedActivities]) {
    if (!allIds.has(a.id)) { allIds.add(a.id); activities.push(a) }
  }

  const total          = activities.length
  const done           = activities.filter(a => a.status === 'done').length
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

  const ownTotal = ownActivities.length
  const ownDone  = ownActivities.filter(a => a.status === 'done').length
  const ownRate  = ownTotal > 0 ? Math.round((ownDone / ownTotal) * 100) : 0

  const sharedTotal = invitedActivities.length
  const sharedDone  = invitedActivities.filter(a => a.status === 'done').length
  const sharedRate  = sharedTotal > 0 ? Math.round((sharedDone / sharedTotal) * 100) : 0

  // Group invited activities by owner → collaborator list
  const collaboratorMap: Record<string, Collaborator> = {}
  for (const act of invitedActivities) {
    const profile = act.profile as Profile | undefined
    if (!profile) continue
    if (!collaboratorMap[profile.id]) collaboratorMap[profile.id] = { profile, activities: [] }
    collaboratorMap[profile.id].activities.push(act)
  }
  const collaborators = Object.values(collaboratorMap)
    .sort((a, b) => b.activities.length - a.activities.length)

  const byCategory = Object.keys(CATEGORY_CONFIG)
    .map(cat => ({ cat, count: activities.filter(a => a.category === cat).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)

  const byStatus = Object.keys(STATUS_CONFIG)
    .map(s => ({ status: s, count: activities.filter(a => a.status === s).length }))
    .filter(s => s.count > 0)

  let streak = 0
  let d = new Date()
  while (streak <= 365) {
    const hasActivity = activities.some(a => a.date === format(d, 'yyyy-MM-dd') && a.status === 'done')
    if (!hasActivity) break
    streak++
    d = subDays(d, 1)
  }

  const heatmapDays = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() })

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded-xl w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
        </div>
        <div className="h-40 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-2xl font-semibold">Estadísticas</h1>
            <InfoTooltip text="Analiza tu productividad en el período seleccionado (semana, mes o 3 meses). Ve cuántas actividades completaste, cuántas siguen pendientes y cómo se distribuyen por categoría y colaboradores." />
          </div>
          <p className="text-sm text-muted-foreground">Actividades propias y compartidas contigo</p>
        </div>
        <div className="flex items-center bg-muted rounded-xl p-1">
          {(['week', 'month', '3months'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {r === 'week' ? '7 días' : r === 'month' ? '30 días' : '90 días'}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs — all ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',         value: total,              icon: '📋' },
          { label: 'Completadas',   value: done,               icon: '✅' },
          { label: 'Tasa',          value: `${completionRate}%`, icon: '📊' },
          { label: 'Racha actual',  value: `${streak} días`,   icon: '🔥' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Own vs Shared comparison ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold mb-4">Mis actividades vs. Compartidas conmigo</h2>
        <div className="grid grid-cols-2 gap-6">
          {/* Own */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🧑</span>
              <span className="text-sm font-medium">Propias</span>
            </div>
            <div className="text-3xl font-bold mb-1">{ownTotal}</div>
            <div className="text-xs text-muted-foreground mb-3">
              {ownDone} completadas · {ownRate}%
            </div>
            <div className="space-y-1.5">
              {Object.keys(STATUS_CONFIG).map(s => {
                const count = ownActivities.filter(a => a.status === s).length
                if (count === 0) return null
                const cfg = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]
                return (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_BAR_COLOR[s] }} />
                    <span className="text-muted-foreground flex-1">{cfg.label}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shared */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤝</span>
              <span className="text-sm font-medium">Compartidas</span>
            </div>
            <div className="text-3xl font-bold mb-1">{sharedTotal}</div>
            <div className="text-xs text-muted-foreground mb-3">
              {sharedTotal > 0 ? `${sharedDone} completadas · ${sharedRate}%` : 'Sin actividades compartidas'}
            </div>
            {sharedTotal > 0 && (
              <div className="space-y-1.5">
                {Object.keys(STATUS_CONFIG).map(s => {
                  const count = invitedActivities.filter(a => a.status === s).length
                  if (count === 0) return null
                  const cfg = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_BAR_COLOR[s] }} />
                      <span className="text-muted-foreground flex-1">{cfg.label}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Comparison bar */}
        {total > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Propias {ownTotal > 0 ? Math.round((ownTotal / total) * 100) : 0}%</span>
              <span>Compartidas {sharedTotal > 0 ? Math.round((sharedTotal / total) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-primary rounded-l-full transition-all"
                style={{ width: `${total > 0 ? (ownTotal / total) * 100 : 0}%` }} />
              <div className="h-full bg-violet-500 rounded-r-full transition-all"
                style={{ width: `${total > 0 ? (sharedTotal / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Heatmap ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold mb-3">Actividad — últimos 30 días</h2>
        <div className="flex flex-wrap gap-1">
          {heatmapDays.map(day => {
            const dateStr   = format(day, 'yyyy-MM-dd')
            const dayActs   = activities.filter(a => a.date === dateStr)
            const dayDone   = dayActs.filter(a => a.status === 'done').length
            const dayTotal  = dayActs.length
            const rate      = dayTotal > 0 ? dayDone / dayTotal : 0
            return (
              <div key={dateStr} className="w-7 h-7 rounded-md"
                style={{ backgroundColor: dayTotal === 0 ? 'hsl(var(--muted))' : `rgba(99,102,241,${0.15 + rate * 0.85})` }}
                title={`${format(day, "d 'de' MMM", { locale: es })}: ${dayDone}/${dayTotal} completadas`}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <span>Menos</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map(o => (
            <div key={o} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${o})` }} />
          ))}
          <span>Más</span>
        </div>
      </div>

      {/* ── Category + Status ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Por categoría</h2>
          {byCategory.length === 0
            ? <p className="text-sm text-muted-foreground">Sin datos</p>
            : (
              <div className="space-y-2">
                {byCategory.map(({ cat, count }) => {
                  const cfg = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>{cfg.emoji} {cfg.label}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Por estado</h2>
          {byStatus.length === 0
            ? <p className="text-sm text-muted-foreground">Sin datos</p>
            : (
              <div className="space-y-2">
                {byStatus.map(({ status, count }) => {
                  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('w-2 h-2 rounded-full', cfg.dotColor)} />
                          {cfg.label}
                        </span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STATUS_BAR_COLOR[status] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* ── Collaborators detail ── */}
      {collaborators.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">🤝 Detalle por colaborador</h2>
            <span className="text-xs text-muted-foreground">
              {collaborators.length} persona{collaborators.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-5">
            {collaborators.map(({ profile, activities: colActs }) => {
              const colDone  = colActs.filter(a => a.status === 'done').length
              const colRate  = colActs.length > 0 ? Math.round((colDone / colActs.length) * 100) : 0
              const colByStatus = Object.keys(STATUS_CONFIG)
                .map(s => ({ status: s, count: colActs.filter(a => a.status === s).length }))
                .filter(s => s.count > 0)
              const mostRecentDate = colActs.map(a => a.date).sort().reverse()[0]

              return (
                <div key={profile.id}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: profile.color || '#6366f1' }}>
                      {profile.avatar_url
                        ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(profile.full_name, profile.email).charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate">
                          {profile.full_name || profile.email}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {colActs.length} actividad{colActs.length !== 1 ? 'es' : ''}
                        </span>
                      </div>

                      {/* Completion bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${colRate}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums w-8 text-right">
                          {colRate}%
                        </span>
                      </div>

                      {/* Status badges */}
                      <div className="flex gap-1.5 flex-wrap">
                        {colByStatus.map(({ status, count }) => {
                          const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
                          return (
                            <span key={status}
                              className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', cfg.bgColor, cfg.textColor)}>
                              {count} {cfg.label}
                            </span>
                          )
                        })}
                      </div>

                      {/* Most recent activity date */}
                      {mostRecentDate && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                          Última actividad: {format(new Date(mostRecentDate + 'T12:00:00'), "d 'de' MMMM", { locale: es })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Activity list for this collaborator */}
                  {colActs.length <= 5 && (
                    <div className="mt-2 ml-13 space-y-1 pl-[52px]">
                      {colActs
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(act => {
                          const cfg = STATUS_CONFIG[act.status]
                          return (
                            <div key={act.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className={cn('text-[10px] font-bold shrink-0', cfg.textColor)}>
                                {act.status === 'done' ? '✓' : act.status === 'blocked' ? '✕' : act.status === 'in_progress' ? '▶' : '○'}
                              </span>
                              <span className="truncate">{act.emoji} {act.title}</span>
                              <span className="shrink-0 tabular-nums text-[10px]">
                                {format(new Date(act.date + 'T12:00:00'), 'd MMM', { locale: es })}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                  {colActs.length > 5 && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 pl-[52px]">
                      {colActs.length} actividades en el periodo seleccionado
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
