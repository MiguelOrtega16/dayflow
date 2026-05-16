'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getActivitiesForRange, updateActivityStatus } from '@/lib/api'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG } from '@/lib/utils'
import type { Activity, ActivityStatus, Profile } from '@/types'
import { CheckCircle2, Circle, Play, Ban, SkipForward, Loader2 } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'

const STATUS_ICONS = {
  todo: Circle,
  in_progress: Play,
  done: CheckCircle2,
  blocked: Ban,
  skipped: SkipForward,
}

const STATUS_CYCLE: ActivityStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'skipped']

export default function OverviewPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | '7days' | '30days' | '90days'>('today')
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => { setLoading(true); loadData() }, [range])

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

  const done = activities.filter(a => a.status === 'done').length
  const total = activities.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'

  const grouped = {
    todo: activities.filter(a => a.status === 'todo'),
    in_progress: activities.filter(a => a.status === 'in_progress'),
    done: activities.filter(a => a.status === 'done'),
    blocked: activities.filter(a => a.status === 'blocked'),
    skipped: activities.filter(a => a.status === 'skipped'),
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Saludo */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold">
                {greeting}, {profile?.full_name?.split(' ')[0] || 'ahí'} 👋
              </h1>
              <InfoTooltip text="Vista rápida de tus actividades del período seleccionado. Muestra tu progreso general, tareas pendientes y completadas, agrupadas por estado y categoría." />
            </div>
            <p className="text-muted-foreground capitalize">
              {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
          <div className="flex items-center bg-muted rounded-xl p-1 shrink-0">
            {(['today', '7days', '30days', '90days'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {r === 'today' ? 'Hoy' : r === '7days' ? '7 días' : r === '30days' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progreso del período */}
      {loading ? (
        <div className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 rounded shimmer" />
            <div className="h-7 w-12 rounded shimmer" />
          </div>
          <div className="h-2.5 rounded-full shimmer" />
          <div className="flex gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-3 w-20 rounded shimmer" />)}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              {range === 'today' ? 'Progreso de hoy' : range === '7days' ? 'Últimos 7 días' : range === '30days' ? 'Últimos 30 días' : 'Últimos 90 días'}
            </h2>
            <span className="text-2xl font-bold text-primary">{pct}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {Object.entries(grouped).filter(([, acts]) => acts.length > 0).map(([status, acts]) => {
              const cfg = STATUS_CONFIG[status as ActivityStatus]
              return (
                <span key={status} className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', cfg.dotColor)} />
                  {acts.length} {cfg.label.toLowerCase()}
                </span>
              )
            })}
            {total === 0 && <span>Sin actividades{range === 'today' ? ' por hoy' : ' en este período'}</span>}
          </div>
        </div>
      )}

      {/* Lista agrupada por estado */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-3 w-24 rounded shimmer" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/40">
              <div className="w-4 h-4 rounded-full shrink-0 mt-0.5 shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded shimmer" style={{ width: `${55 + (i * 13) % 35}%` }} />
                <div className="h-2.5 w-24 rounded shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">✦</div>
          <p className="text-muted-foreground">{range === 'today' ? 'Aún no hay actividades para hoy.' : 'Sin actividades en este período.'}</p>
          <p className="text-sm text-muted-foreground/70 mt-1">¡Ve al Calendario para agregar algunas!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(['in_progress', 'todo', 'blocked', 'done', 'skipped'] as ActivityStatus[]).map(status => {
            const acts = grouped[status]
            if (acts.length === 0) return null
            const cfg = STATUS_CONFIG[status]
            const Icon = STATUS_ICONS[status]
            return (
              <div key={status}>
                <h3 className={cn('text-xs font-semibold uppercase tracking-wider mb-2', cfg.textColor)}>
                  {cfg.label} · {acts.length}
                </h3>
                <div className="space-y-2">
                  {acts.map(activity => (
                    <div key={activity.id} className={cn('flex items-start gap-3 p-3 rounded-xl border', cfg.bgColor, cfg.color)}>
                      <button
                        onClick={() => handleCycleStatus(activity)}
                        disabled={updatingIds.has(activity.id)}
                        className={cn('mt-0.5 shrink-0 hover:opacity-70 transition-opacity', cfg.textColor)}
                        title="Clic para cambiar estado"
                      >
                        {updatingIds.has(activity.id)
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Icon className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {activity.emoji && <span>{activity.emoji}</span>}
                          <span className={cn(
                            'text-sm font-medium',
                            status === 'done' && 'line-through opacity-60',
                            status === 'skipped' && 'opacity-40'
                          )}>
                            {activity.title}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {CATEGORY_CONFIG[activity.category].emoji}
                          </span>
                        </div>
                        {range !== 'today' && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {format(parseISO(activity.date), "d 'de' MMMM", { locale: es })}
                          </p>
                        )}
                        {activity.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{activity.description}</p>
                        )}
                        {status === 'in_progress' && activity.completion_percentage > 0 && (
                          <div className="mt-1.5 h-1 bg-background/60 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${activity.completion_percentage}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
