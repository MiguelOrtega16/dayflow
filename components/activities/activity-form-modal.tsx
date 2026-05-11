'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { X, Clock, Smile, Target, UserPlus, CheckCircle2, XCircle } from 'lucide-react'
import { cn, CATEGORY_CONFIG, STATUS_CONFIG } from '@/lib/utils'
import {
  createActivity, updateActivity, createRecurringActivities, getGoals,
  getActivityTitleSuggestions, getActivityInvitations, inviteToActivity,
  cancelActivityInvitation, searchUsers, getSharedCalendarUsers,
} from '@/lib/api'
import type {
  Activity, ActivityStatus, ActivityCategory, RecurrenceType,
  Profile, Goal, ActivityInvitation,
} from '@/types'

const EMOJIS = ['🎯', '✅', '📚', '💪', '🏃', '🧘', '💻', '🎨', '📝', '🔧', '🌱', '⭐', '🚀', '💡', '🎵', '🍎']

function nextHalfHour(): string {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (m < 30) return `${String(h).padStart(2, '0')}:30`
  const nh = h + 1
  if (nh >= 24) return '23:30'
  return `${String(nh).padStart(2, '0')}:00`
}

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 30)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface ActivityFormModalProps {
  date: Date
  activity?: Activity | null
  currentUser: Profile | null
  onClose: () => void
  onSaved: () => void
  initialStartTime?: string
  initialEndTime?: string
}


export function ActivityFormModal({ date, activity, currentUser, onClose, onSaved, initialStartTime, initialEndTime }: ActivityFormModalProps) {
  const isEditing = !!activity
  const router = useRouter()

  // Core fields
  const [title, setTitle]             = useState(activity?.title || '')
  const [description, setDescription] = useState(activity?.description || '')
  const [selectedDate, setSelectedDate] = useState(activity?.date || format(date, 'yyyy-MM-dd'))
  const [status, setStatus]           = useState<ActivityStatus>(activity?.status || 'todo')
  const [category, setCategory]       = useState<ActivityCategory>(activity?.category || 'task')
  const [goalId, setGoalId]           = useState<string>(activity?.goal_id || '')
  const [emoji, setEmoji]             = useState(activity?.emoji || '')
  const defaultStart = !isEditing && !initialStartTime ? nextHalfHour() : (activity?.start_time || initialStartTime || '')
  const defaultEnd   = !isEditing && !initialEndTime   ? addMins(defaultStart, 60) : (activity?.end_time || initialEndTime || '')

  const [startTime, setStartTime]     = useState(defaultStart)
  const [endTime, setEndTime]         = useState(defaultEnd)

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  const handleStartTimeChange = (val: string) => {
    setStartTime(val)
    setEndTimeError(false)
    if (!isReminder && val && (!endTime || toMin(endTime) <= toMin(val))) setEndTime(addMins(val, 60))
  }

  const handleEndTimeChange = (val: string) => {
    if (val && startTime && toMin(val) <= toMin(startTime)) {
      setEndTimeError(true)
      return
    }
    setEndTimeError(false)
    setEndTime(val)
  }
  const [isPublic, setIsPublic]       = useState(activity?.is_public ?? false)
  const [completionPct, setCompletionPct] = useState(activity?.completion_percentage || 0)
  const tagsInput = activity?.tags?.join(', ') || ''
  // Hidden but preserved on edit so existing priority/notes aren't lost
  const existingPriority = activity?.priority || 'medium'
  const existingNotes    = activity?.notes    || null

  // Recurrence
  const [recurrenceType, setRecurrenceType]     = useState<RecurrenceType>(activity?.recurrence_type || 'none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [recurrenceCount, setRecurrenceCount]   = useState(1)
  const [daysOfWeek, setDaysOfWeek]             = useState<number[]>([])
  const isReminder = category === 'reminder'

  // UI state
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showTitleEmoji, setShowTitleEmoji]   = useState(false)
  const [goals, setGoals]                 = useState<Goal[]>([])
  const [titleTouched, setTitleTouched]   = useState(false)
  const [endTimeError, setEndTimeError]   = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)

  // Title autocomplete
  const [suggestions, setSuggestions]     = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Evidence image

  // Participants — existing invitations (edit) + pending to send after save (both modes)
  const [invitations, setInvitations]         = useState<ActivityInvitation[]>([])
  const [pendingInvitees, setPendingInvitees] = useState<Profile[]>([])
  const [inviteSearch, setInviteSearch]       = useState('')
  const [inviteResults, setInviteResults]     = useState<Profile[]>([])
  // IDs of users with whom the current user has an accepted calendar share
  const [sharedUserIds, setSharedUserIds]     = useState<string[] | null>(null)

  useEffect(() => {
    if (currentUser) getGoals(currentUser.id).then(setGoals).catch(() => {})
    if (isEditing && activity?.id) getActivityInvitations(activity.id).then(setInvitations).catch(() => {})
  }, [currentUser?.id, activity?.id])

  useEffect(() => {
    if (!currentUser) return
    getSharedCalendarUsers(currentUser.id)
      .then(shares => {
        const ids = (shares || []).map((sc: any) =>
          sc.owner_id === currentUser.id ? sc.shared_with_id : sc.owner_id
        ).filter(Boolean)
        setSharedUserIds(ids)
      })
      .catch(() => setSharedUserIds([]))
  }, [currentUser?.id])

  // Title suggestions
  useEffect(() => {
    if (!currentUser || title.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current)
    suggestTimeout.current = setTimeout(() => {
      getActivityTitleSuggestions(currentUser.id, title)
        .then(r => { setSuggestions(r.filter(s => s.toLowerCase() !== title.toLowerCase())); setShowSuggestions(true) })
        .catch(() => {})
    }, 280)
    return () => { if (suggestTimeout.current) clearTimeout(suggestTimeout.current) }
  }, [title, currentUser?.id])

  // Invite search
  const alreadyInvitedIds = new Set([
    ...invitations.map(i => i.invitee_id),
    ...pendingInvitees.map(u => u.id),
  ])
  useEffect(() => {
    if (!currentUser || inviteSearch.length < 2 || !sharedUserIds?.length) { setInviteResults([]); return }
    const t = setTimeout(() => {
      searchUsers(inviteSearch, currentUser.id)
        .then(r => setInviteResults(
          (r || []).filter(u => sharedUserIds.includes(u.id) && !alreadyInvitedIds.has(u.id))
        ))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [inviteSearch, currentUser?.id, invitations.length, pendingInvitees.length, sharedUserIds])

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault()
    console.log('[ActivityForm] submit — title:', title, 'user:', currentUser?.id ?? 'NULL')

    if (!title.trim()) { setTitleTouched(true); setSaveError('El título no puede estar vacío.'); return }
    if (!currentUser)  { setSaveError('Sesión expirada. Recarga la página.'); return }
    if (isReminder && !startTime) { setSaveError('Los recordatorios requieren una hora.'); return }
    // Only the owner or an accepted invitee may edit an existing activity
    if (isEditing && activity!.user_id !== currentUser.id && !activity!.invitation_id) {
      setSaveError('No tienes permiso para editar esta actividad.')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {

      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

      const evidenceUrl = activity?.evidence_image_url || null

      const payload: Record<string, unknown> = {
        // On edit, preserve the original owner — never transfer ownership when a participant saves
        user_id:            isEditing ? activity!.user_id : currentUser.id,
        title:              title.trim(),
        description:        description.trim() || null,
        date:               selectedDate,
        status,
        priority:           existingPriority,   // preserved; not exposed in UI
        notes:              existingNotes,       // preserved; not exposed in UI
        category,
        goal_id:            goalId || null,
        emoji:              emoji || null,
        start_time:         startTime || null,
        end_time:           isReminder ? null : (endTime || null),
        is_public:          isReminder ? false : isPublic,
        completion_percentage: completionPct,
        tags,
        recurrence_type:    recurrenceType,
        recurrence_config:  recurrenceType !== 'none' ? {
          end_date:    recurrenceEndDate || undefined,
          occurrences: recurrenceEndDate ? undefined : recurrenceCount,
          days_of_week: recurrenceType === 'custom' ? daysOfWeek : undefined,
        } : null,
        color:              null,
        parent_activity_id: activity?.parent_activity_id || null,
        ...(activity?.invited_from_activity_id ? { invited_from_activity_id: activity.invited_from_activity_id } : {}),
        ...(evidenceUrl ? { evidence_image_url: evidenceUrl } : {}),
      }

      let savedId: string | null = null
      if (isEditing) {
        await updateActivity(activity.id, payload as any, currentUser?.id)
        savedId = activity.id
      } else if (recurrenceType !== 'none') {
        const parent = await createRecurringActivities(payload as any, recurrenceType, (payload.recurrence_config as any)!)
        savedId = parent?.id ?? null
      } else {
        const created = await createActivity(payload as any)
        savedId = created?.id ?? null
      }

      // Send invitations to pending invitees
      if (savedId && pendingInvitees.length > 0) {
        for (const invitee of pendingInvitees) {
          await inviteToActivity(savedId, currentUser.id, invitee.id).catch(err =>
            console.warn('[ActivityForm] invite failed for', invitee.id, err)
          )
        }
      }

      onSaved()
    } catch (err: any) {
      console.error('Save activity error:', err)
      setSaveError(err?.message || 'Error al guardar. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  const insertTitleEmoji = (e: string) => {
    const el = titleRef.current
    if (!el) { setTitle(t => t + e); setShowTitleEmoji(false); return }
    const start = el.selectionStart ?? title.length
    const end   = el.selectionEnd   ?? title.length
    const next  = title.slice(0, start) + e + title.slice(end)
    setTitle(next)
    setShowTitleEmoji(false)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + e.length, start + e.length) }, 0)
  }

  const handleAddPending = (user: Profile) => {
    setPendingInvitees(prev => [...prev, user])
    setInviteSearch('')
    setInviteResults([])
  }

  const handleCancelInvitation = async (invId: string) => {
    await cancelActivityInvitation(invId).catch(() => {})
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }


  const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

  const INV_STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptó', declined: 'Declinó' }
  const INV_STATUS_COLOR: Record<string, string> = {
    pending:  'text-amber-600 dark:text-amber-400',
    accepted: 'text-emerald-600 dark:text-emerald-400',
    declined: 'text-red-500',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg hover:bg-muted/80 transition-colors relative"
            >
              {emoji || CATEGORY_CONFIG[category].emoji}
              {showEmojiPicker && (
                <div className="absolute top-11 left-0 z-10 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-8 gap-1 w-52">
                  {EMOJIS.map(e => (
                    <button key={e} type="button"
                      onClick={ev => { ev.stopPropagation(); setEmoji(e); setShowEmojiPicker(false) }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                    >{e}</button>
                  ))}
                  <button type="button"
                    onClick={ev => { ev.stopPropagation(); setEmoji(''); setShowEmojiPicker(false) }}
                    className="col-span-2 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
                  >Quitar</button>
                </div>
              )}
            </button>
            <h2 className="text-lg font-semibold">
              {isEditing ? `Editar ${CATEGORY_CONFIG[category].label.toLowerCase()}` : `${['task','note'].includes(category) ? 'Nueva' : 'Nuevo'} ${CATEGORY_CONFIG[category].label.toLowerCase()}`}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Divider only */}
        <div className="border-b border-border" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">


          {/* ── FORM ── */}
          {true && (
            <>
              {/* Title with autocomplete + inline emoji picker */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Título <span className="text-destructive">*</span>
                </label>
                <div className={cn(
                  'relative flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors',
                  titleTouched && !title.trim()
                    ? 'border-destructive ring-1 ring-destructive/40'
                    : 'border-input focus-within:ring-2 focus-within:ring-ring'
                )}>
                  <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
                    onBlur={() => { setTitleTouched(true); setTimeout(() => setShowSuggestions(false), 150) }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="¿Qué quieres lograr?" required autoFocus
                    className="flex-1 text-base font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/60 min-w-0 disabled:opacity-60"
                  />
                  <div className="relative shrink-0">
                    <button type="button" onClick={() => setShowTitleEmoji(p => !p)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Insertar emoji en el título"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    {showTitleEmoji && (
                      <div className="absolute top-9 right-0 z-20 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-8 gap-1 w-52">
                        {EMOJIS.map(e => (
                          <button key={e} type="button"
                            onClick={ev => { ev.stopPropagation(); insertTitleEmoji(e) }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                          >{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-8 z-20 mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                      {suggestions.map(s => (
                        <button key={s} type="button"
                          onMouseDown={() => { setTitle(s); setShowSuggestions(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
                        >{s}</button>
                      ))}
                    </div>
                  )}
                </div>
                {titleTouched && !title.trim() && (
                  <p className="text-xs text-destructive mt-1">El título es requerido</p>
                )}
              </div>

              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Añade una descripción (opcional)" rows={2}
                className="w-full text-sm bg-muted/40 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground/50"
              />

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Categoría</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(CATEGORY_CONFIG) as ActivityCategory[]).filter(c => c !== 'habit' && c !== 'note').map(cat => (
                    <button key={cat} type="button" onClick={() => setCategory(cat)}
                      className={cn('flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-all',
                        category === cat ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="text-base">{CATEGORY_CONFIG[cat].emoji}</span>
                      <span>{CATEGORY_CONFIG[cat].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date row */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Fecha</label>
                <input type="date" lang="es" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {/* Time row — for reminders: time + days counter side by side */}
              {isReminder ? (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Hora <span className="text-primary font-bold">*</span>
                  </label>
                  <TimePicker value={startTime} onChange={handleStartTimeChange} placeholder="--" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Hora inicio
                    </label>
                    <TimePicker value={startTime} onChange={handleStartTimeChange} placeholder="--" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Hora fin
                    </label>
                    <TimePicker value={endTime} onChange={handleEndTimeChange} placeholder="--" />
                    {endTimeError && (
                      <p className="text-xs text-destructive mt-1">Debe ser posterior a la de inicio</p>
                    )}
                  </div>
                </div>
              )}

              {/* Status — hidden for reminders */}
              {!isReminder && <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Estado</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(Object.keys(STATUS_CONFIG) as ActivityStatus[]).map(s => (
                    <button key={s} type="button" onClick={() => setStatus(s)}
                      className={cn('py-1.5 px-2 rounded-xl border text-xs font-medium transition-all text-center',
                        status === s
                          ? cn('border-transparent', STATUS_CONFIG[s].bgColor, STATUS_CONFIG[s].textColor)
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      )}
                    >{STATUS_CONFIG[s].label}</button>
                  ))}
                </div>
              </div>}

              {/* ── Repetición ── */}
              <div className="border-t border-border/50 pt-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repetir</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: 'none',     label: 'Nunca' },
                    { value: 'daily',    label: '🗓 Diario' },
                    { value: 'weekdays', label: '💼 Días hábiles' },
                    { value: 'weekly',   label: '📅 Semanal' },
                    { value: 'monthly',  label: '🌙 Mensual' },
                    { value: 'custom',   label: '⚙️ Personalizado' },
                  ] as const).filter(opt => isReminder ? ['none','daily','weekly','monthly'].includes(opt.value) : true).map(opt => (
                    <button key={opt.value} type="button" onClick={() => setRecurrenceType(opt.value)}
                      className={cn('py-2 px-2 rounded-xl border text-xs font-medium transition-all',
                        recurrenceType === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 text-muted-foreground'
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
                {recurrenceType === 'custom' && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Días de la semana</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, i) => (
                        <button key={i} type="button"
                          onClick={() => setDaysOfWeek(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                          className={cn('w-8 h-8 rounded-full text-xs font-medium border transition-all',
                            daysOfWeek.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40'
                          )}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {recurrenceType !== 'none' && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium text-muted-foreground">Fin</label>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Fecha de fin (opcional)</label>
                      <input type="date" lang="es" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {!recurrenceEndDate && (
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">Número de veces</label>
                        <input type="number" min={1} max={365} value={recurrenceCount}
                          onChange={e => setRecurrenceCount(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                          className="w-20 text-center rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Completion (only in_progress) */}
              {status === 'in_progress' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground">Progreso</label>
                    <input type="number" min={0} max={100} value={completionPct}
                      onChange={e => setCompletionPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                      className="w-16 text-center rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                  </div>
                  <input type="range" min={0} max={100} value={completionPct}
                    onChange={e => setCompletionPct(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}

              {/* Evidence hidden — feature preserved in DB/API but not exposed in UI */}

              {/* Goal — hidden for reminders */}
              {!isReminder && goals.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Target className="w-3 h-3" /> Vincular a meta
                  </label>
                  <select value={goalId} onChange={e => setGoalId(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Sin meta</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.title}</option>)}
                  </select>
                </div>
              )}

              {/* ── Visibility toggle ── */}
              {!isReminder && <div className="border-t border-border/50 pt-4">
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors',
                    isPublic
                      ? 'border-primary/40 bg-primary/5 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{isPublic ? '👁' : '🔒'}</span>
                    <div className="text-left">
                      <p className="text-sm font-medium">{isPublic ? 'Visible' : 'Privado'}</p>
                      <p className="text-[11px] opacity-70">
                        {isPublic
                          ? 'Las personas con las que compartes tu calendario pueden verla y comentarla, pero no modificarla'
                          : 'Solo tú y las personas a las que invitas pueden ver esta actividad'}
                      </p>
                    </div>
                  </div>
                  <div className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0', isPublic ? 'bg-primary' : 'bg-muted-foreground/30')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', isPublic ? 'translate-x-4' : 'translate-x-0.5')} />
                  </div>
                </button>
              </div>}

              {/* ── Invitar personas ── */}
              {!isReminder && <div className="border-t border-border/50 pt-4">
                <div className="mb-2">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> Invitar personas
                  </span>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Los invitados pueden ver <strong>y modificar</strong> esta actividad
                  </p>
                </div>

                {sharedUserIds !== null && sharedUserIds.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">
                    Para invitar a alguien, primero comparte tu calendario con esa persona en la sección{' '}
                    <button
                      type="button"
                      className="font-bold underline hover:opacity-70 transition-opacity"
                      onClick={() => { onClose(); router.push('/dashboard/people') }}
                    >Personas</button>.
                  </p>
                ) : (
                  <input type="text" value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
                    placeholder="Busca entre tus contactos…"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
                {inviteResults.length > 0 && (
                  <div className="mt-1 border border-border rounded-xl overflow-hidden">
                    {inviteResults.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 border-b border-border last:border-b-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: u.color }}>
                          {u.full_name?.[0] || u.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.full_name || u.username || u.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <button type="button"
                          onClick={() => handleAddPending(u)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <UserPlus className="w-3 h-3" />
                          Invitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending invitees (pre-save, create mode) */}
                {pendingInvitees.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {pendingInvitees.map(u => (
                      <div key={u.id} className="flex items-center gap-3 py-1.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: u.color }}>
                          {u.full_name?.[0] || u.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">Se invitará al guardar</p>
                        </div>
                        <button type="button" onClick={() => setPendingInvitees(prev => prev.filter(x => x.id !== u.id))}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Existing invitations (edit mode) */}
                {invitations.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {invitations.map(inv => {
                      const person = inv.invitee
                      return (
                        <div key={inv.id} className="flex items-center gap-3 py-1.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: person?.color || '#6366f1' }}>
                            {person?.avatar_url
                              ? <img src={person.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                              : (person?.full_name?.[0] || person?.email?.[0] || '?')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{person?.full_name || person?.email}</p>
                            <p className={cn('text-xs font-medium', INV_STATUS_COLOR[inv.status])}>
                              {INV_STATUS_LABEL[inv.status]}
                            </p>
                          </div>
                          {inv.status === 'pending' && (
                            <button type="button" onClick={() => handleCancelInvitation(inv.id)}
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Cancelar invitación">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {inv.status === 'accepted' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          {inv.status === 'declined' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>}

            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 py-3 border-t border-border">
          {saveError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="button" disabled={saving || !title.trim()}
              onClick={e => handleSubmit(e)}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Guardando...' : pendingInvitees.length > 0
                ? `${isEditing ? 'Guardar' : 'Crear'} e invitar (${pendingInvitees.length})`
                : isEditing
                  ? 'Guardar cambios'
                  : `Crear ${CATEGORY_CONFIG[category].label.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TimePicker (12h format, text inputs) ─────────────────────────────────────
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const parse = (v: string) => {
    if (!v) return { h: '', m: '', p: (new Date().getHours() >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' }
    const [hRaw, mRaw] = v.split(':')
    const h24 = parseInt(hRaw)
    return {
      h: String(h24 % 12 || 12),
      m: mRaw || '00',
      p: (h24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
    }
  }

  const [local, setLocal] = useState(() => parse(value))

  useEffect(() => { setLocal(parse(value)) }, [value])

  const push = (h: string, m: string, p: 'AM' | 'PM') => {
    const hNum = parseInt(h)
    if (!h || isNaN(hNum)) { onChange(''); return }
    const h24 = p === 'AM' ? (hNum === 12 ? 0 : hNum) : (hNum === 12 ? 12 : hNum + 12)
    const mNum = Math.min(59, Math.max(0, parseInt(m) || 0))
    onChange(`${String(h24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`)
  }

  const update = (field: 'h' | 'm' | 'p', val: string) => {
    const next = { ...local, [field]: val }
    setLocal(next)
    push(next.h, next.m, next.p as 'AM' | 'PM')
  }

  const inputCls = 'w-10 text-center rounded-lg border border-input bg-background px-1 py-2 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums'

  return (
    <div className="flex items-center gap-1">
      <input type="text" inputMode="numeric" maxLength={2} value={local.h} placeholder="--"
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '')
          const n = parseInt(v)
          if (v === '' || (!isNaN(n) && n >= 0 && n <= 12)) update('h', v)
        }}
        onBlur={() => {
          if (local.h) push(local.h, local.m, local.p as 'AM' | 'PM')
        }}
        className={inputCls}
      />
      <span className="text-xs font-bold text-muted-foreground shrink-0">:</span>
      <input type="text" inputMode="numeric" maxLength={2} value={local.m} placeholder="00"
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '')
          const n = parseInt(v)
          if (v === '' || (!isNaN(n) && n <= 59)) update('m', v)
        }}
        onBlur={() => {
          if (local.m.length === 1) {
            const padded = local.m.padStart(2, '0')
            const next = { ...local, m: padded }
            setLocal(next)
            push(next.h, padded, next.p as 'AM' | 'PM')
          }
        }}
        className={inputCls}
      />
      <button type="button"
        onClick={() => update('p', local.p === 'AM' ? 'PM' : 'AM')}
        className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs font-semibold hover:bg-muted transition-colors shrink-0 tabular-nums"
      >
        {local.p || 'AM'}
      </button>
    </div>
  )
}
