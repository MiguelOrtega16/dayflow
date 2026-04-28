'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { X, Clock, Hash, Target } from 'lucide-react'
import { cn, CATEGORY_CONFIG, STATUS_CONFIG, PRIORITY_CONFIG } from '@/lib/utils'
import { createActivity, updateActivity, createRecurringActivities, getGoals } from '@/lib/api'
import type { Activity, ActivityStatus, ActivityPriority, TaskCategory, RecurrenceType, Profile, Goal } from '@/types'

const EMOJIS = ['🎯', '✅', '📚', '💪', '🏃', '🧘', '💻', '🎨', '📝', '🔧', '🌱', '⭐', '🚀', '💡', '🎵', '🍎']

interface ActivityFormModalProps {
  date: Date
  activity?: Activity | null
  currentUser: Profile | null
  onClose: () => void
  onSaved: () => void
}

export function ActivityFormModal({ date, activity, currentUser, onClose, onSaved }: ActivityFormModalProps) {
  const isEditing = !!activity

  const [title, setTitle] = useState(activity?.title || '')
  const [description, setDescription] = useState(activity?.description || '')
  const [selectedDate, setSelectedDate] = useState(activity?.date || format(date, 'yyyy-MM-dd'))
  const [status, setStatus] = useState<ActivityStatus>(activity?.status || 'todo')
  const [priority, setPriority] = useState<ActivityPriority>(activity?.priority || 'medium')
  const [category, setCategory] = useState<TaskCategory>(activity?.category || 'task')
  const [goalId, setGoalId] = useState<string>(activity?.goal_id || '')
  const [emoji, setEmoji] = useState(activity?.emoji || '')
  const [startTime, setStartTime] = useState(activity?.start_time || '')
  const [endTime, setEndTime] = useState(activity?.end_time || '')
  const [notes, setNotes] = useState(activity?.notes || '')
  const [isPublic, setIsPublic] = useState(activity?.is_public ?? true)
  const [completionPct, setCompletionPct] = useState(activity?.completion_percentage || 0)
  const [tagsInput, setTagsInput] = useState(activity?.tags?.join(', ') || '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(activity?.recurrence_type || 'none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [recurrenceCount, setRecurrenceCount] = useState(10)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [saving, setSaving] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'schedule' | 'recurrence'>('basic')

  useEffect(() => {
    if (currentUser) {
      getGoals(currentUser.id).then(setGoals).catch(() => {})
    }
  }, [currentUser])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !currentUser) return
    setSaving(true)

    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

      const payload = {
        user_id: currentUser.id,
        title: title.trim(),
        description: description.trim() || null,
        date: selectedDate,
        status,
        priority,
        category,
        goal_id: goalId || null,
        emoji: emoji || null,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes.trim() || null,
        is_public: isPublic,
        completion_percentage: completionPct,
        tags,
        recurrence_type: recurrenceType,
        recurrence_config: recurrenceType !== 'none' ? {
          end_date: recurrenceEndDate || undefined,
          occurrences: recurrenceEndDate ? undefined : recurrenceCount,
          days_of_week: recurrenceType === 'custom' ? daysOfWeek : undefined,
        } : null,
        color: null,
        parent_activity_id: activity?.parent_activity_id || null,
      }

      if (isEditing) {
        await updateActivity(activity.id, payload)
      } else if (recurrenceType !== 'none') {
        await createRecurringActivities(payload, recurrenceType, payload.recurrence_config!)
      } else {
        await createActivity(payload)
      }

      onSaved()
    } catch (err) {
      console.error('Failed to save activity:', err)
    } finally {
      setSaving(false)
    }
  }

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg hover:bg-muted/80 transition-colors relative"
            >
              {emoji || CATEGORY_CONFIG[category].emoji}
              {showEmojiPicker && (
                <div className="absolute top-11 left-0 z-10 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-8 gap-1 w-52">
                  {EMOJIS.map(e => (
                    <button key={e} type="button"
                      onClick={(ev) => { ev.stopPropagation(); setEmoji(e); setShowEmojiPicker(false) }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                    >{e}</button>
                  ))}
                  <button type="button"
                    onClick={(ev) => { ev.stopPropagation(); setEmoji(''); setShowEmojiPicker(false) }}
                    className="col-span-2 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
                  >Clear</button>
                </div>
              )}
            </button>
            <h2 className="text-lg font-display font-semibold">
              {isEditing ? 'Edit Activity' : 'New Activity'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {(['basic', 'schedule', 'recurrence'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors',
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >{tab}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {activeTab === 'basic' && (
              <>
                {/* Title */}
                <input
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="What do you want to accomplish?"
                  required autoFocus
                  className="w-full text-base font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
                />

                {/* Description */}
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Add a description (optional)" rows={2}
                  className="w-full text-sm bg-muted/40 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground/50"
                />

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map(cat => (
                      <button key={cat} type="button" onClick={() => setCategory(cat)}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-all',
                          category === cat
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span className="text-base">{CATEGORY_CONFIG[cat].emoji}</span>
                        <span>{CATEGORY_CONFIG[cat].label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Link to Goal */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Target className="w-3 h-3" /> Link to a Goal (optional)
                  </label>
                  <select
                    value={goalId}
                    onChange={e => setGoalId(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— No goal —</option>
                    {goals.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.emoji ? `${g.emoji} ` : ''}{g.title}
                      </option>
                    ))}
                  </select>
                  {goals.length === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1 px-1">
                      No goals yet. Create one in the Goals page first.
                    </p>
                  )}
                </div>

                {/* Status & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value as ActivityStatus)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      {(Object.keys(STATUS_CONFIG) as ActivityStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as ActivityPriority)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      {(Object.keys(PRIORITY_CONFIG) as ActivityPriority[]).map(p => (
                        <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Completion */}
                {status === 'in_progress' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Completion: {completionPct}%</label>
                    <input type="range" min={0} max={100} value={completionPct}
                      onChange={e => setCompletionPct(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Tags (comma separated)
                  </label>
                  <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                    placeholder="workout, health, morning"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Additional notes..." rows={2}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                {/* Visibility */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div onClick={() => setIsPublic(!isPublic)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative', isPublic ? 'bg-primary' : 'bg-muted')}
                  >
                    <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', isPublic ? 'translate-x-4' : 'translate-x-0.5')} />
                  </div>
                  <span className="text-sm font-medium">Visible to shared users</span>
                </label>
              </>
            )}

            {activeTab === 'schedule' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Start time
                    </label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> End time
                    </label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'recurrence' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repeat</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { value: 'none', label: 'Never' },
                      { value: 'daily', label: '🗓 Daily' },
                      { value: 'weekdays', label: '💼 Weekdays' },
                      { value: 'weekly', label: '📅 Weekly' },
                      { value: 'monthly', label: '🌙 Monthly' },
                      { value: 'custom', label: '⚙️ Custom' },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button" onClick={() => setRecurrenceType(opt.value)}
                        className={cn(
                          'py-2 px-2 rounded-xl border text-xs font-medium transition-all',
                          recurrenceType === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 text-muted-foreground'
                        )}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>

                {recurrenceType === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Days of week</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, i) => (
                        <button key={i} type="button"
                          onClick={() => setDaysOfWeek(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                          className={cn(
                            'w-8 h-8 rounded-full text-xs font-medium border transition-all',
                            daysOfWeek.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40'
                          )}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {recurrenceType !== 'none' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">End</label>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">End date (optional)</label>
                        <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      {!recurrenceEndDate && (
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Or number of occurrences: {recurrenceCount}</label>
                          <input type="range" min={2} max={365} value={recurrenceCount}
                            onChange={e => setRecurrenceCount(Number(e.target.value))}
                            className="w-full accent-primary"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted transition-colors"
            >Cancel</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save changes' : recurrenceType !== 'none' ? 'Create recurring' : 'Create activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

