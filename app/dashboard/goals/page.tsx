'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Target, ChevronDown, ChevronRight, Trash2, CheckCircle2, Circle, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGoals, createGoal, updateGoal, deleteGoal } from '@/lib/api'
import { STATUS_CONFIG, PRIORITY_CONFIG } from '@/lib/utils'
import type { Goal, ActivityStatus, ActivityPriority, Profile } from '@/types'

const GOAL_EMOJIS = ['🎯', '🚀', '💪', '📚', '🏃', '🌱', '💡', '⭐', '🎨', '🏆', '💼', '🔬']

export default function GoalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const supabase = createClient()

  const [newTitle, setNewTitle] = useState('')
  const [newEmoji, setNewEmoji] = useState('🎯')
  const [newDescription, setNewDescription] = useState('')
  const [newTargetDate, setNewTargetDate] = useState('')
  const [newPriority, setNewPriority] = useState<ActivityPriority>('medium')
  const [creating, setCreating] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)
    const data = await getGoals(user.id)
    setGoals(data)
    setLoading(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !profile) return
    setCreating(true)
    try {
      const goal = await createGoal({
        user_id: profile.id,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        emoji: newEmoji,
        color: null,
        status: 'todo',
        priority: newPriority,
        target_date: newTargetDate || null,
        is_public: true,
      })
      setGoals(prev => [{ ...goal, task_count: 0, done_count: 0 }, ...prev])
      setNewTitle('')
      setNewDescription('')
      setNewTargetDate('')
      setNewEmoji('🎯')
      setNewPriority('medium')
      setShowCreateForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (goal: Goal, status: ActivityStatus) => {
    await updateGoal(goal.id, { status })
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, status } : g))
    setOpenMenuId(null)
  }

  const handleDelete = async (goalId: string) => {
    await deleteGoal(goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
    setOpenMenuId(null)
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalGoals = goals.length
  const doneGoals = goals.filter(g => g.status === 'done').length
  const overallPct = totalGoals > 0 ? Math.round((doneGoals / totalGoals) * 100) : 0

  const activeGoals = goals.filter(g => !['done', 'skipped'].includes(g.status))
  const completedGoals = goals.filter(g => g.status === 'done')
  const skippedGoals = goals.filter(g => g.status === 'skipped')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold mb-1">Metas</h1>
            <p className="text-sm text-muted-foreground">
              Resultados a largo plazo basados en tareas vinculadas
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {totalGoals > 0 && (
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{overallPct}%</div>
                <div className="text-xs text-muted-foreground">{doneGoals}/{totalGoals} logradas</div>
              </div>
            )}
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva meta
            </button>
          </div>
        </div>
      </div>

      {/* Formulario de creación */}
      {showCreateForm && (
        <div className="mb-6 bg-card border border-border rounded-2xl p-4 animate-scale-in">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl hover:bg-muted/80 transition-colors"
                >
                  {newEmoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-10 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-6 gap-1 w-44">
                    {GOAL_EMOJIS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { setNewEmoji(e); setShowEmojiPicker(false) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Título de la meta…"
                required
                autoFocus
                className="flex-1 text-sm font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
              />
            </div>

            <textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={2}
              className="w-full text-sm bg-muted/40 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground/50"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha límite</label>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={e => setNewTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Prioridad</label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as ActivityPriority)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {(Object.keys(PRIORITY_CONFIG) as ActivityPriority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creando…' : 'Crear meta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de metas */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer" />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium mb-1">Aún no hay metas</p>
          <p className="text-sm text-muted-foreground mb-4">
            Las metas rastrean resultados a largo plazo. Vincula tareas a una meta para medir el progreso.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Crea tu primera meta
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <GoalSection
              title={`Activas (${activeGoals.length})`}
              goals={activeGoals}
              expandedIds={expandedIds}
              openMenuId={openMenuId}
              onToggleExpand={toggleExpand}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onOpenMenu={setOpenMenuId}
            />
          )}
          {completedGoals.length > 0 && (
            <GoalSection
              title={`Logradas (${completedGoals.length})`}
              goals={completedGoals}
              expandedIds={expandedIds}
              openMenuId={openMenuId}
              onToggleExpand={toggleExpand}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onOpenMenu={setOpenMenuId}
              muted
            />
          )}
          {skippedGoals.length > 0 && (
            <GoalSection
              title={`Omitidas (${skippedGoals.length})`}
              goals={skippedGoals}
              expandedIds={expandedIds}
              openMenuId={openMenuId}
              onToggleExpand={toggleExpand}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onOpenMenu={setOpenMenuId}
              muted
            />
          )}
        </div>
      )}

      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  )
}

function GoalSection({
  title, goals, expandedIds, openMenuId,
  onToggleExpand, onStatusChange, onDelete, onOpenMenu,
  muted = false,
}: {
  title: string
  goals: Goal[]
  expandedIds: Set<string>
  openMenuId: string | null
  onToggleExpand: (id: string) => void
  onStatusChange: (goal: Goal, status: ActivityStatus) => void
  onDelete: (id: string) => void
  onOpenMenu: (id: string | null) => void
  muted?: boolean
}) {
  return (
    <div className={muted ? 'opacity-70' : ''}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="space-y-2">
        {goals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            expanded={expandedIds.has(goal.id)}
            menuOpen={openMenuId === goal.id}
            onToggleExpand={() => onToggleExpand(goal.id)}
            onStatusChange={(s) => onStatusChange(goal, s)}
            onDelete={() => onDelete(goal.id)}
            onOpenMenu={() => onOpenMenu(openMenuId === goal.id ? null : goal.id)}
          />
        ))}
      </div>
    </div>
  )
}

function GoalCard({
  goal, expanded, menuOpen,
  onToggleExpand, onStatusChange, onDelete, onOpenMenu,
}: {
  goal: Goal
  expanded: boolean
  menuOpen: boolean
  onToggleExpand: () => void
  onStatusChange: (s: ActivityStatus) => void
  onDelete: () => void
  onOpenMenu: () => void
}) {
  const taskCount = goal.task_count ?? 0
  const doneCount = goal.done_count ?? 0
  const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0
  const statusCfg = STATUS_CONFIG[goal.status]
  const priorityCfg = PRIORITY_CONFIG[goal.priority]

  return (
    // overflow-hidden removed — it clips the absolute-positioned dropdown menu
    <div className="bg-card border border-border rounded-2xl transition-all">
      {/* Fila de encabezado */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={onToggleExpand}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <span className="text-xl shrink-0">{goal.emoji || '🎯'}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn(
              'font-medium text-sm',
              goal.status === 'done' && 'line-through opacity-60',
              goal.status === 'skipped' && 'opacity-40'
            )}>
              {goal.title}
            </p>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusCfg.bgColor, statusCfg.textColor)}>
              {statusCfg.label}
            </span>
            {goal.priority !== 'medium' && (
              <span className={cn('text-[10px] font-medium', priorityCfg.color)}>
                {priorityCfg.icon} {priorityCfg.label}
              </span>
            )}
          </div>

          {goal.target_date && (
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              Vence {format(parseISO(goal.target_date), "d 'de' MMM 'de' yyyy", { locale: es })}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', progress === 100 ? 'bg-emerald-500' : 'bg-primary')}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {doneCount}/{taskCount} tareas
            </span>
          </div>
        </div>

        {/* Menú de opciones */}
        <div className="relative shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onOpenMenu() }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-50 w-48 bg-popover border border-border rounded-xl shadow-xl py-1 text-sm"
              onClick={e => e.stopPropagation()}
            >
              <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Estado
              </p>
              {(['todo', 'in_progress', 'done', 'blocked', 'skipped'] as ActivityStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  className={cn(
                    'w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2',
                    goal.status === s && 'text-primary font-medium'
                  )}
                >
                  {goal.status === s
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    : <Circle className="w-3.5 h-3.5 shrink-0 opacity-30" />
                  }
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              <button
                onClick={onDelete}
                className="w-full text-left px-3 py-2 hover:bg-muted text-destructive transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Eliminar meta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tareas vinculadas (expandido) */}
      {expanded && (
        <div className="border-t border-border rounded-b-2xl overflow-hidden">
          {goal.description && (
            <p className="px-4 py-3 text-sm text-muted-foreground border-b border-border/50">
              {goal.description}
            </p>
          )}

          {taskCount === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              <p className="mb-1">Aún no hay tareas vinculadas.</p>
              <p className="text-xs opacity-70">Al crear una tarea en el calendario, selecciona esta meta para vincularla aquí.</p>
            </div>
          ) : (
            <div className="px-4 py-2 space-y-1">
              {(goal.tasks || []).map(task => {
                const cfg = STATUS_CONFIG[task.status]
                return (
                  <div key={task.id} className="flex items-center gap-2 py-1.5">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dotColor)} />
                    {task.emoji && <span className="text-xs">{task.emoji}</span>}
                    <span className={cn(
                      'text-sm flex-1 truncate',
                      task.status === 'done' && 'line-through opacity-50',
                      task.status === 'skipped' && 'opacity-40'
                    )}>
                      {task.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {task.date ? format(parseISO(task.date), "d 'de' MMM", { locale: es }) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
