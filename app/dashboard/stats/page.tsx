'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, STATUS_CONFIG, CATEGORY_CONFIG } from '@/lib/utils'
import type { Activity } from '@/types'

export default function StatsPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'week' | 'month' | '3months'>('month')
  const supabase = createClient()

  useEffect(() => {
    loadStats()
  }, [range])

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date()
    let startDate: string
    const endDate = format(today, 'yyyy-MM-dd')

    if (range === 'week') startDate = format(subDays(today, 6), 'yyyy-MM-dd')
    else if (range === 'month') startDate = format(subDays(today, 29), 'yyyy-MM-dd')
    else startDate = format(subDays(today, 89), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    setActivities(data || [])
    setLoading(false)
  }

  const total = activities.length
  const done = activities.filter(a => a.status === 'done').length
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

  const byCategory = Object.keys(CATEGORY_CONFIG).map(cat => ({
    cat,
    count: activities.filter(a => a.category === cat).length,
  })).filter(c => c.count > 0).sort((a, b) => b.count - a.count)

  const byStatus = Object.keys(STATUS_CONFIG).map(s => ({
    status: s,
    count: activities.filter(a => a.status === s).length,
  })).filter(s => s.count > 0)

  let streak = 0
  let d = new Date()
  while (true) {
    const dateStr = format(d, 'yyyy-MM-dd')
    const hasActivity = activities.some(a => a.date === dateStr && a.status === 'done')
    if (!hasActivity) break
    streak++
    d = subDays(d, 1)
    if (streak > 365) break
  }

  const heatmapDays = eachDayOfInterval({
    start: subDays(new Date(), 29),
    end: new Date(),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Tus estadísticas</h1>
          <p className="text-muted-foreground">Rastrea tu productividad a lo largo del tiempo</p>
        </div>

        <div className="flex items-center bg-muted rounded-xl p-1">
          {(['week', 'month', '3months'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                range === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r === 'week' ? '7d' : r === 'month' ? '30d' : '90d'}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas clave */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total actividades', value: total, icon: '📋' },
          { label: 'Completadas', value: done, icon: '✅' },
          { label: 'Tasa de completado', value: `${completionRate}%`, icon: '📊' },
          { label: 'Racha actual', value: `${streak}d`, icon: '🔥' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Mapa de calor */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">Mapa de calor (últimos 30 días)</h2>
        <div className="flex flex-wrap gap-1">
          {heatmapDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayActivities = activities.filter(a => a.date === dateStr)
            const dayDone = dayActivities.filter(a => a.status === 'done').length
            const dayTotal = dayActivities.length
            const rate = dayTotal > 0 ? dayDone / dayTotal : 0

            return (
              <div
                key={dateStr}
                className="w-7 h-7 rounded-md transition-colors"
                style={{
                  backgroundColor: dayTotal === 0
                    ? 'hsl(var(--muted))'
                    : `rgba(99, 102, 241, ${0.15 + rate * 0.85})`,
                }}
                title={`${format(day, "d 'de' MMM", { locale: es })}: ${dayDone}/${dayTotal} completadas`}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <span>Menos</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map(opacity => (
            <div
              key={opacity}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: `rgba(99, 102, 241, ${opacity})` }}
            />
          ))}
          <span>Más</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Por categoría */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Por categoría</h2>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos aún</p>
          ) : (
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
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Por estado */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Por estado</h2>
          {byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos aún</p>
          ) : (
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
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: `hsl(var(--${status === 'done' ? 'done' : status === 'in_progress' ? 'in-progress' : status === 'blocked' ? 'blocked' : 'muted-foreground'}))` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
