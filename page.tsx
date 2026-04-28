'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { cn, STATUS_CONFIG, PRIORITY_CONFIG } from '@/lib/utils'
import { getGoals, createGoal, updateGoal, deleteGoal, getGoalWithTasks } from '@/lib/api'
import type { Goal, Activity, ActivityStatus, ActivityPriority } from '@/types'
import { Plus, X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

const GOAL_EMOJIS = ['🎯', '🏆', '🚀', '💡', '📚', '💪', '🌱', '⭐', '🎨', '🧘', '💻', '🌍']
const GOAL_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6']

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)
  const [goalTasks, setGoalTasks] = useState<Record<string, Activity[]>>({})
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [userId, setUserId] = useState<string>('')

  // Create form state
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newEmoji, setNewEmoji] = useState('🎯')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newPriority, setNewPriority] = useState<ActivityPriority>('medium')
  const [newTargetDate, setNewTargetDate] = useState('')
  const [creating, setCreating] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const data = await getGoals(user.id)
    setGoals(data)
    setLoading(false)
  }

  const handleExpand = async (goalId: string) => {
    if (expandedGoalId === goalId) { setExpandedGoalId(null); return }
    setExpandedGoalId(goalId)
    if (!goalTasks[goalId]) {
      const g = await getGoalWithTasks(goalId)
      setGoalTasks(prev => ({ ...prev, [goalId]: g.tasks || [] }))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !userId) return
    setCreating(true)
    try {
      await createGoal({
        user_id: userId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        emoji: newEmoji,
        color: newColor,
        status: 'todo',
        priority: newPriority,
        target_date: newTargetDate || null,
        is_public: true,
      })
      setNewTitle(''); setNewDescription(''); setNewEmoji('🎯')
      setNewColor('#6366f1'); setNewTargetDate(''); setNewPriority('medium')
      setShowCreateForm(false)
      loadData()
    } finally { setCreating(false) }
  }

  const handleStatusChange = async (goalId: string, status: ActivityStatus) => {
    await updateGoal(goalId, { status })
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status } : g))
  }

  const handleDelete = async (goalId: string) => {
    if (!confirm('Delete this goal? Tasks linked to it will remain but be unlinked.')) return
    await deleteGoal(goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const done = goals.filter(g => g.status === 'done').length
  const active = goals.filter(g => !['done', 'skipped'].includes(g.status))
  const completed = goals.filter(g => g.status === 'done')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-1">Goals</h1>
          <p className="text-muted-foreground text-sm">
            Big-picture objectives. Link daily tasks to track progress.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {/* Summary bar */}
      {goals.length > 0 && (
        <div className="flex items-center gap-6 bg-card border border-border rounded-2xl px-5 py-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-display font-bold">{goals.length}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-amber-500">{active.length}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-emerald-500">{done}</div>
            <div className="text-xs text-muted-foreground">Achieved</div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Overall progress</span>
              <span>{goals.length > 0 ? Math.round((done / goals.length) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${goals.length > 0 ? (done / goals.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-card border-2 border-primary/30 rounded-2xl p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Create a new goal</h3>
            <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            {/* Emoji + title row */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1 flex-wrap w-48">
                {GOAL_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setNewEmoji(e)}
                    className={cn('w-7 h-7 rounded-lg text-base flex items-center justify-center transition-all',
                      newEmoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'
                    )}
                  >{e}</button>
                ))}
              </div>
              <input
                type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Goal title…" required autoFocus
                className="flex-1 text-base font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            <textarea
              value={newDescription} onChange={e => setNewDescription(e.target.value)}
              placeholder="What does success look like? (optional)" rows={2}
              className="w-full text-sm bg-muted/40 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground/50"
            />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                <select value={newPriority} onChange={e => setNewPriority(e.target.value as ActivityPriority)}
                  className="w-full rounded-xl border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Target date</label>
                <input type="date" value={newTargetDate} onChange={e => setNewTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {GOAL_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 text-sm border border-border rounded-xl hover:bg-muted transition-colors"
              >Cancel</button>
              <button type="submit" disabled={creating || !newTitle.trim()}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >{creating ? 'Creating…' : 'Create goal'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Goals list */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl shimmer" />)}</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <div className="text-5xl mb-3">🎯</div>
          <p className="font-semibold mb-1">No goals yet</p>
          <p className="text-sm text-muted-foreground mb-4">Goals are your big-picture objectives. Tasks can be linked to them.</p>
          <button onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >Create your first goal</button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active goals */}
          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active</h2>
              <div className="space-y-2">
                {active.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    tasks={goalTasks[goal.id]}
                    expanded={expandedGoalId === goal.id}
                    onExpand={() => handleExpand(goal.id)}
                    onStatusChange={(s) => handleStatusChange(goal.id, s)}
                    onDelete={() => handleDelete(goal.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Completed goals */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3">Achieved 🎉</h2>
              <div className="space-y-2 opacity-70">
                {completed.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    tasks={goalTasks[goal.id]}
                    expanded={expandedGoalId === goal.id}
                    onExpand={() => handleExpand(goal.id)}
                    onStatusChange={(s) => handleStatusChange(goal.id, s)}
                    onDelete={() => handleDelete(goal.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GoalCard({
  goal, tasks, expanded, onExpand, onStatusChange, onDelete
}: {
  goal: Goal
  tasks?: Activity[]
  expanded: boolean
  onExpand: () => void
  onStatusChange: (s: ActivityStatus) => void
  onDelete: () => void
}) {
  const taskCount = tasks?.length ?? 0
  const doneCount = tasks?.filter(t => t.status === 'done').length ?? 0
  const progress = taskCount > 0 ? (doneCount / taskCount) * 100 : 0
  const priorityCfg = PRIORITY_CONFIG[goal.priority]

  return (
    <div
      className="bg-card border border-border rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeftWidth: 3, borderLeftColor: goal.color || '#6366f1' }}
    >
      {/* Goal header */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={onExpand} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <span className="text-xl shrink-0">{goal.emoji || '🎯'}</span>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onExpand}>
          <div className="flex items-center gap-2">
            <p className={cn('font-semibold truncate', goal.status === 'done' && 'line-through opacity-60')}>
              {goal.title}
            </p>
            <span className={cn('text-[10px] font-medium shrink-0', priorityCfg.color)}>
              {priorityCfg.icon}
            </span>
          </div>
          {goal.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{goal.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {/* Progress mini bar */}
            {taskCount > 0 && (
              <div className="flex items-center gap-1.5 flex-1 max-w-32">
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{doneCount}/{taskCount}</span>
              </div>
            )}
            {taskCount === 0 && (
              <span className="text-[10px] text-muted-foreground">No tasks linked yet</span>
            )}
            {goal.target_date && (
              <span className="text-[10px] text-muted-foreground">
                📅 {format(new Date(goal.target_date + 'T00:00:00'), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Status selector */}
        <select
          value={goal.status}
          onChange={e => onStatusChange(e.target.value as ActivityStatus)}
          onClick={e => e.stopPropagation()}
          className="text-xs border border-border rounded-lg px-2 py-1 bg-background outline-none shrink-0"
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done ✓</option>
          <option value="blocked">Blocked</option>
          <option value="skipped">Skipped</option>
        </select>

        <button
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          title="Delete goal"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded: linked tasks */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1.5">
          {!tasks ? (
            <p className="text-xs text-muted-foreground">Loading tasks…</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tasks linked. When creating an activity, select this goal under "Link to a Goal".
            </p>
          ) : (
            tasks.map(task => {
              const statusCfg = STATUS_CONFIG[task.status]
              return (
                <div key={task.id} className="flex items-center gap-2 py-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusCfg.dotColor)} />
                  <span className={cn('text-sm flex-1 truncate', task.status === 'done' && 'line-through opacity-50')}>
                    {task.emoji && <span className="mr-1">{task.emoji}</span>}
                    {task.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(task.date + 'T00:00:00'), 'MMM d')}
                  </span>
                  <span className={cn('text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-full', statusCfg.bgColor, statusCfg.textColor)}>
                    {statusCfg.label}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

