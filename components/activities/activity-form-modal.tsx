'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDays, addMonths, subMonths, format, parseISO,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, nextSunday,
} from 'date-fns'
import {
  X, Clock, Smile, UserPlus, CheckCircle2, XCircle, Crown,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Bell, Repeat as RepeatIcon, Tag, Users, Eye, Lock, ClipboardList,
} from 'lucide-react'
import { cn, CATEGORY_CONFIG, STATUS_CONFIG, statusLabel, categoryLabel } from '@/lib/utils'
import { useI18n, weekdayNarrow, weekdayShort, dateFnsLocale } from '@/lib/i18n'
import { useBackButtonClose } from '@/lib/back-button'
import {
  createActivity, updateActivity, createRecurringActivities, getGoals,
  getActivityTitleSuggestions, getActivityInvitations, inviteToActivity,
  cancelActivityInvitation, searchUsers, getSharedCalendarUsers,
  generateRecurrenceDates, RECURRENCE_HARD_CAP,
} from '@/lib/api'
import { CustomSelect } from '@/components/ui/custom-select'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { getUserPreferences } from '@/lib/user-preferences'
import { syncWidgetSnapshot } from '@/lib/widget-sync'
import { track } from '@/lib/analytics/posthog'
import { ChipTour, type ChipTourStep } from '@/components/onboarding/chip-tour'
import type {
  Activity, ActivityStatus, ActivityCategory, RecurrenceType, RecurrenceFrequency,
  Profile, Goal, ActivityInvitation,
} from '@/types'

// Free presets: none, hourly, daily, weekly, monthly, yearly.
// Pro: 'custom' (interval+freq or days-of-week) and legacy 'weekdays'.
// Keep in sync with the activities insert RLS in schema.sql.
const PRO_RECURRENCE: RecurrenceType[] = ['weekdays', 'custom']

const MAX_INSTANCES_BY_UNIT: Record<RecurrenceFrequency, number> = {
  hour:  168,
  day:   365,
  week:  104,
  month: 60,
  year:  20,
}

function effectiveFrequency(
  type: RecurrenceType,
  freq: RecurrenceFrequency | undefined,
  daysOfWeek: number[],
): RecurrenceFrequency {
  if (type === 'hourly')  return 'hour'
  if (type === 'daily')   return 'day'
  if (type === 'weekly')  return 'week'
  if (type === 'monthly') return 'month'
  if (type === 'yearly')  return 'year'
  if (type === 'weekdays') return 'day'
  if (type === 'custom') {
    if (daysOfWeek.length > 0) return 'day'
    return freq ?? 'day'
  }
  return 'day'
}

function maxRepeatsForFrequency(unit: RecurrenceFrequency): number {
  return Math.min(MAX_INSTANCES_BY_UNIT[unit], RECURRENCE_HARD_CAP) - 1
}

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

function fmt12(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
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
  const { t, locale } = useI18n()
  const isEditing = !!activity
  const router = useRouter()

  useBackButtonClose(true, onClose)

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
  // New activities default to "visible" so they show up in shared calendars
  // by default (the previous false fallback caused brand-new activities to
  // be private regardless of the schema-level true default). For edits we
  // honor whatever the activity already has. The user's preference can flip
  // this default to private — loaded async below.
  const [isPublic, setIsPublic]       = useState(activity?.is_public ?? true)
  // Read the user's default-visibility preference for NEW activities and
  // patch the initial state once it lands. Skipped when editing because the
  // activity's own is_public takes precedence then.
  useEffect(() => {
    if (isEditing) return
    if (!currentUser?.id) return
    let cancelled = false
    getUserPreferences(currentUser.id)
      .then(prefs => { if (!cancelled) setIsPublic(prefs.default_activity_public) })
      .catch(() => { /* fall back to the true default already set above */ })
    return () => { cancelled = true }
  }, [isEditing, currentUser?.id])
  const [completionPct, setCompletionPct] = useState(activity?.completion_percentage || 0)
  const tagsInput = activity?.tags?.join(', ') || ''
  const existingPriority = activity?.priority || 'medium'
  const existingNotes    = activity?.notes    || null

  // Recurrence
  const initialRecurrenceConfig = activity?.recurrence_config ?? {}
  const [recurrenceType, setRecurrenceType]     = useState<RecurrenceType>(activity?.recurrence_type || 'none')
  const [recurrenceCount, setRecurrenceCount]   = useState(
    Math.max(1, (initialRecurrenceConfig.occurrences ?? 10) - 1)
  )
  const [daysOfWeek, setDaysOfWeek]             = useState<number[]>(initialRecurrenceConfig.days_of_week ?? [])
  const [customInterval, setCustomInterval]     = useState(initialRecurrenceConfig.interval ?? 1)
  const [customFrequency, setCustomFrequency]   = useState<RecurrenceFrequency>(initialRecurrenceConfig.frequency ?? 'day')
  const [customMode, setCustomMode]             = useState<'interval' | 'days'>(
    (initialRecurrenceConfig.days_of_week?.length ?? 0) > 0 ? 'days' : 'interval'
  )
  const [limitMode, setLimitMode]               = useState<'count' | 'end_date'>(
    initialRecurrenceConfig.end_date ? 'end_date' : 'count'
  )
  const [endDate, setEndDate]                   = useState<string>(initialRecurrenceConfig.end_date ?? '')
  const isReminder = category === 'reminder'

  // Multi-reminder offsets
  const [reminderOffsets, setReminderOffsets] = useState<number[]>(
    activity?.reminder_offsets && activity.reminder_offsets.length > 0
      ? activity.reminder_offsets
      : (activity?.category === 'reminder' ? [0] : [30])
  )

  // Reminders are read-only when editing a non-recurring activity that's
  // already in the past — they can't fire anymore so changing them just
  // confuses users. Recurring activities keep editable reminders since
  // changes apply to future occurrences.
  // Lead-time check for reminder offsets. The cron at
  // app/api/cron/activity-30min-reminders fires when
  // `minutesUntilStart - offset` falls in [-FIRE_WINDOW_MIN, +FIRE_WINDOW_MIN].
  // If we save with an offset bigger than the time remaining, that window is
  // already in the past and the reminder is silently skipped — warn instead.
  const REMINDER_FIRE_WINDOW_MIN = 2
  const minutesUntilStart = (() => {
    if (!selectedDate || !startTime) return null
    const t = new Date(`${selectedDate}T${startTime}:00`).getTime()
    if (isNaN(t)) return null
    return Math.round((t - Date.now()) / 60_000)
  })()
  const offsetWillFire = (offset: number): boolean => {
    if (minutesUntilStart === null) return true
    return minutesUntilStart - offset >= -REMINDER_FIRE_WINDOW_MIN
  }

  const isPastNonRecurring = isEditing && recurrenceType === 'none' && (() => {
    if (!selectedDate) return false
    if (startTime) {
      // Treat the date/time as local. Falls past once the start moment is in the past.
      return new Date(`${selectedDate}T${startTime}:00`).getTime() < Date.now()
    }
    // No specific start_time: past once the date is strictly before today.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return new Date(`${selectedDate}T00:00:00`).getTime() < startOfToday.getTime()
  })()

  // Mobile sheet — one open at a time. Each chip opens a focused bottom sheet
  // instead of a positioned popover (popovers misbehave under the modal's
  // transform-animated container in some browsers).
  type SheetKey = 'type' | 'schedule' | 'invitees' | null
  const [openSheet, setOpenSheet] = useState<SheetKey>(null)

  // First-run chip tour. Fires once per user on mobile when:
  //   - currentUser is loaded
  //   - profile.preferences.dismissed_tour_activity_form_chips is falsy
  //   - viewport matches the mobile chip-rail breakpoint (< sm = 640 px)
  //   - no bottom sheet has been opened yet (so the chips are visible)
  // We delay the gate by 350 ms after the modal mounts to let the slide-up
  // animation settle — measuring chip positions mid-animation gives stale
  // coordinates and the spotlight ends up off-screen.
  const [showChipTour, setShowChipTour] = useState(false)
  useEffect(() => {
    if (!currentUser?.id) return
    const prefs = (currentUser as { preferences?: Record<string, unknown> }).preferences ?? {}
    if (prefs['dismissed_tour_activity_form_chips']) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    const timer = setTimeout(() => setShowChipTour(true), 350)
    return () => clearTimeout(timer)
  }, [currentUser?.id])

  const chipTourSteps: ChipTourStep[] = (() => {
    const steps: ChipTourStep[] = []
    if (!isEditing) {
      steps.push({
        targetSelector: '[data-tour="templates"]',
        title: t('onboarding.chipTour.activityForm.templates.title'),
        body:  t('onboarding.chipTour.activityForm.templates.body'),
      })
    }
    steps.push(
      { targetSelector: '[data-tour="type"]',       title: t('onboarding.chipTour.activityForm.type.title'),       body: t('onboarding.chipTour.activityForm.type.body') },
      { targetSelector: '[data-tour="schedule"]',   title: t('onboarding.chipTour.activityForm.schedule.title'),   body: t('onboarding.chipTour.activityForm.schedule.body') },
      { targetSelector: '[data-tour="invitees"]',   title: t('onboarding.chipTour.activityForm.invitees.title'),   body: t('onboarding.chipTour.activityForm.invitees.body') },
      { targetSelector: '[data-tour="visibility"]', title: t('onboarding.chipTour.activityForm.visibility.title'), body: t('onboarding.chipTour.activityForm.visibility.body') },
    )
    return steps
  })()

  // Inside the schedule sheet, the Time/Reminder/Repeat sub-rows expand inline.
  type ScheduleRowKey = 'time' | 'reminder' | 'repeat' | null
  const [openScheduleRow, setOpenScheduleRow] = useState<ScheduleRowKey>(null)

  const FREE_REMINDER_LIMIT = 1
  const REMINDER_HARD_CAP = 10
  const REMINDER_PRESETS = [0, 5, 15, 30, 60, 1440] as const

  const formatReminderOffset = (min: number): string => {
    if (min === 0) return t('activityForm.reminderPresets.atStart')
    if (min < 60) return t('activityForm.reminderPresets.minBefore', { count: min })
    if (min < 1440) {
      const h = Math.round(min / 60)
      return t('activityForm.reminderPresets.hourBefore', { count: h })
    }
    const d = Math.round(min / 1440)
    return t('activityForm.reminderPresets.dayBefore', { count: d })
  }

  const addReminderOffset = () => {
    if (!entitlement.isPro && reminderOffsets.length >= FREE_REMINDER_LIMIT) {
      openPaywall('multi_reminder')
      return
    }
    if (reminderOffsets.length >= REMINDER_HARD_CAP) return
    const unused = REMINDER_PRESETS.find(p => !reminderOffsets.includes(p)) ?? 30
    setReminderOffsets(prev => [...prev, unused])
  }
  const updateReminderOffset = (idx: number, value: number) => {
    setReminderOffsets(prev => prev.map((v, i) => (i === idx ? value : v)))
  }
  const removeReminderOffset = (idx: number) => {
    setReminderOffsets(prev => prev.filter((_, i) => i !== idx))
  }

  const effectiveUnit = effectiveFrequency(recurrenceType, customFrequency, daysOfWeek)
  const maxRepeats = maxRepeatsForFrequency(effectiveUnit)

  useEffect(() => {
    if (recurrenceCount > maxRepeats) setRecurrenceCount(maxRepeats)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRepeats])

  const previewCount = useMemo(() => {
    if (recurrenceType === 'none') return 0
    const cfg: Record<string, unknown> = {}
    if (limitMode === 'count') {
      cfg.occurrences = recurrenceCount + 1
    } else if (endDate) {
      cfg.end_date = endDate
    } else {
      cfg.occurrences = recurrenceCount + 1
    }
    if (recurrenceType === 'custom') {
      if (customMode === 'days') cfg.days_of_week = daysOfWeek
      else { cfg.interval = customInterval; cfg.frequency = customFrequency }
    }
    return generateRecurrenceDates(selectedDate, recurrenceType, cfg, startTime || null).length
  }, [recurrenceType, recurrenceCount, daysOfWeek, customInterval, customFrequency, customMode, limitMode, endDate, selectedDate, startTime])

  // UI state
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const { entitlement } = useEntitlement(currentUser?.id ?? null)
  const { open: openPaywall } = usePaywall()
  const [showTitleEmoji, setShowTitleEmoji]   = useState(false)
  const [goals, setGoals]                 = useState<Goal[]>([])
  const [titleTouched, setTitleTouched]   = useState(false)
  const [endTimeError, setEndTimeError]   = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)

  // Title autocomplete
  const [suggestions, setSuggestions]     = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Participants
  const [invitations, setInvitations]         = useState<ActivityInvitation[]>([])
  const [pendingInvitees, setPendingInvitees] = useState<Profile[]>([])
  const [inviteSearch, setInviteSearch]       = useState('')
  const [inviteResults, setInviteResults]     = useState<Profile[]>([])
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

  useEffect(() => {
    if (!currentUser || title.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current)
    suggestTimeout.current = setTimeout(() => {
      getActivityTitleSuggestions(currentUser.id, title)
        .then(r => {
          const unique = Array.from(new Set(r))
          setSuggestions(unique.filter(s => s.toLowerCase() !== title.toLowerCase()))
          setShowSuggestions(true)
        })
        .catch(() => {})
    }, 280)
    return () => { if (suggestTimeout.current) clearTimeout(suggestTimeout.current) }
  }, [title, currentUser?.id])

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

    if (!title.trim()) { setTitleTouched(true); setSaveError(t('activityForm.titleEmpty')); return }
    if (!currentUser)  { setSaveError(t('activityForm.sessionExpired')); return }
    if (isReminder && !startTime) { setSaveError(t('activityForm.reminderRequiresTime')); return }
    if (isEditing && activity!.user_id !== currentUser.id && !activity!.invitation_id) {
      setSaveError(t('activityForm.noPermission'))
      return
    }

    setSaving(true)
    setSaveError(null)
    try {

      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

      const evidenceUrl = activity?.evidence_image_url || null

      const payload: Record<string, unknown> = {
        user_id:            isEditing ? activity!.user_id : currentUser.id,
        title:              title.trim(),
        description:        description.trim() || null,
        date:               selectedDate,
        status,
        priority:           existingPriority,
        notes:              existingNotes,
        category,
        goal_id:            goalId || null,
        emoji:              emoji || null,
        start_time:         startTime || null,
        end_time:           isReminder ? null : (endTime || null),
        is_public:          isPublic,
        completion_percentage: completionPct,
        tags,
        recurrence_type:    recurrenceType,
        recurrence_config:  recurrenceType !== 'none' ? {
          ...(limitMode === 'count'
              ? { occurrences: recurrenceCount + 1 }
              : (endDate ? { end_date: endDate } : { occurrences: recurrenceCount + 1 })),
          ...(recurrenceType === 'custom' && customMode === 'days'
              ? { days_of_week: daysOfWeek }
              : {}),
          ...(recurrenceType === 'custom' && customMode === 'interval'
              ? { interval: customInterval, frequency: customFrequency }
              : {}),
        } : null,
        color:              null,
        parent_activity_id: activity?.parent_activity_id || null,
        ...(activity?.invited_from_activity_id ? { invited_from_activity_id: activity.invited_from_activity_id } : {}),
        ...(evidenceUrl ? { evidence_image_url: evidenceUrl } : {}),
        reminder_offsets: reminderOffsets.length > 0 ? reminderOffsets : null,
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

      if (savedId && pendingInvitees.length > 0) {
        for (const invitee of pendingInvitees) {
          await inviteToActivity(savedId, currentUser.id, invitee.id).catch(err =>
            console.warn('[ActivityForm] invite failed for', invitee.id, err)
          )
        }
      }

      // Catch-up fire for the offset=0 ("at start time") reminder when the
      // activity start is already past by more than the cron's fire window.
      // The 5-min cron would otherwise see delta < -2 and skip it forever;
      // here we trigger the push immediately so "remind me at start" still
      // produces a notification when the user saved a few minutes late.
      // Owner-only — invitees haven't accepted yet at this point.
      if (
        savedId &&
        !isEditing &&
        recurrenceType === 'none' &&
        reminderOffsets.includes(0) &&
        minutesUntilStart !== null &&
        minutesUntilStart < -REMINDER_FIRE_WINDOW_MIN
      ) {
        const label = emoji ? `${emoji} ${title.trim()}` : title.trim()
        const pushTitle = isReminder ? `🔔 ${title.trim()}` : `⏰ ${label}`
        fetch('/api/send-push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            recipientId: currentUser.id,
            title: pushTitle,
            body: t('activityForm.remindersHelp'),
            type: isReminder ? 'activity_reminder' : 'activity_30min_reminder',
            date: selectedDate,
            activityId: savedId,
          }),
        }).catch(() => { /* catch-up is best-effort */ })
      }

      if (!isEditing) {
        track('activity_created', {
          category,
          is_reminder: isReminder,
          has_recurrence: recurrenceType !== 'none',
          recurrence_type: recurrenceType,
          has_goal: !!goalId,
          has_invitees: pendingInvitees.length > 0,
          has_reminders: reminderOffsets.length > 0,
          is_public: isPublic,
        })
        // Notify other surfaces in the same tab — the setup checklist needs
        // to flip its "Add first activity" row to done without a reload, and
        // the calendar view already refetches via its direct onSaved callback.
        window.dispatchEvent(new CustomEvent('dayflow:activity-created'))
      }

      // Refresh the home-screen widget snapshot. Calendar-view also re-syncs
      // after its refetch, but the modal can be opened from pages that don't
      // (overview, tasks list, etc.) — so we call it here too, fire-and-forget.
      syncWidgetSnapshot(currentUser.id).catch(() => {})

      onSaved()
    } catch (err: any) {
      console.error('Save activity error:', err)
      setSaveError(err?.message || t('activityForm.saveError'))
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


  const DAY_LABELS = weekdayNarrow(locale)

  const INV_STATUS_COLOR: Record<string, string> = {
    pending:  'text-amber-600 dark:text-amber-400',
    accepted: 'text-emerald-600 dark:text-emerald-400',
    declined: 'text-red-500',
  }

  // ─── Chip value formatters ────────────────────────────────────────────────

  const dateChipValue = (() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    if (selectedDate === today) return t('activityForm.chip.today')
    if (selectedDate === tomorrow) return t('activityForm.chip.tomorrow')
    try { return format(parseISO(selectedDate), 'd MMM') } catch { return selectedDate }
  })()

  const timeChipValue = (() => {
    if (!startTime) return t('activityForm.dateTimeRow.noneShort')
    if (isReminder || !endTime) return fmt12(startTime)
    return `${fmt12(startTime)} – ${fmt12(endTime)}`
  })()

  const recurrenceChipValue = (() => {
    if (recurrenceType === 'none') return t('activityForm.dateTimeRow.noneShort')
    const baseLabel = t(`activityForm.recurrence.${recurrenceType}`)
    if (limitMode === 'end_date' && endDate) {
      try { return `${baseLabel} → ${format(parseISO(endDate), 'd MMM')}` }
      catch { return baseLabel }
    }
    const repeats = recurrenceCount
    return `${baseLabel} ×${repeats + 1}`
  })()

  const inviteesChipValue = (() => {
    const total = pendingInvitees.length + invitations.length
    if (total === 0) return t('activityForm.chip.noInvitees')
    if (total === 1) return t('activityForm.chip.onePerson')
    return t('activityForm.chip.countPeople', { count: total })
  })()

  const remindersChipValue = (() => {
    if (reminderOffsets.length === 0) return t('activityForm.dateTimeRow.noneShort')
    if (reminderOffsets.length === 1) return formatReminderOffset(reminderOffsets[0])
    return t('activityForm.chip.countReminders', { count: reminderOffsets.length })
  })()

  // ─── Schedule chip summary on mobile: brief 1-line digest ─────────────────
  const scheduleChipSummary = (() => {
    const parts: string[] = [dateChipValue]
    if (startTime) parts.push(fmt12(startTime))
    if (recurrenceType !== 'none') parts.push(t(`activityForm.recurrence.${recurrenceType}`))
    return parts.join(' · ')
  })()

  // ─── Reusable content blocks (used by both desktop sections & mobile sheets) ─

  function renderTypeContent() {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
          .filter(c => c !== 'habit' && c !== 'note')
          .map(cat => {
            const isSel = category === cat
            return (
              <button key={cat} type="button"
                onClick={() => { setCategory(cat); setOpenSheet(prev => prev === 'type' ? null : prev) }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-colors border',
                  isSel
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'bg-card border-border hover:border-foreground/30',
                )}
              >
                <span className="text-base">{CATEGORY_CONFIG[cat].emoji}</span>
                <span className="truncate">{categoryLabel(cat, locale)}</span>
              </button>
            )
          })}
      </div>
    )
  }

  function renderInviteesContent() {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          {t('activityForm.inviteHelp')}
        </p>

        {sharedUserIds !== null && sharedUserIds.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">
            {t('activityForm.noContactsHint')}{' '}
            <button
              type="button"
              className="font-bold underline hover:opacity-70 transition-opacity"
              onClick={() => { onClose(); router.push('/dashboard/people') }}
            >{t('people.title')}</button>.
          </p>
        ) : (
          <input type="text" value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
            placeholder={t('activityForm.contactsSearch')}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        {inviteResults.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden">
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
                  {t('activityForm.invite')}
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingInvitees.length > 0 && (
          <div className="space-y-1.5">
            {pendingInvitees.map(u => (
              <div key={u.id} className="flex items-center gap-3 py-1.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: u.color }}>
                  {u.full_name?.[0] || u.email[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t('activityForm.pendingInvite')}</p>
                </div>
                <button type="button" onClick={() => setPendingInvitees(prev => prev.filter(x => x.id !== u.id))}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {invitations.length > 0 && (
          <div className="space-y-1.5">
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
                      {t(`invitationStatus.${inv.status as 'pending' | 'accepted' | 'declined'}`)}
                    </p>
                  </div>
                  {inv.status === 'pending' && (
                    <button type="button" onClick={() => handleCancelInvitation(inv.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t('activityForm.cancelInvitation')}>
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
      </div>
    )
  }

  // Renders the Schedule sub-modal body — calendar, quick picks, then three
  // collapsible rows for Time / Reminder / Repeat. Reused on desktop with
  // `forceOpenRows` so every section is permanently visible, and on desktop
  // when creating with `hideCalendar` so the picker is suppressed (the parent
  // view's selected day is authoritative).
  function renderScheduleContent({ forceOpenRows, hideCalendar }: { forceOpenRows?: boolean; hideCalendar?: boolean } = {}) {
    const isRowOpen = (row: NonNullable<ScheduleRowKey>) =>
      forceOpenRows ? true : openScheduleRow === row
    const toggleRow = (row: NonNullable<ScheduleRowKey>) =>
      setOpenScheduleRow(prev => (prev === row ? null : row))

    return (
      <div className="space-y-3">
        {hideCalendar ? (
          <div className="text-xs text-muted-foreground">
            {(() => {
              try { return format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: dateFnsLocale(locale) }) }
              catch { return selectedDate }
            })()}
          </div>
        ) : (
          <>
            <MonthGrid
              selectedDate={selectedDate}
              onSelect={d => setSelectedDate(d)}
              locale={locale}
            />
            <QuickPicks
              selectedDate={selectedDate}
              onPick={d => setSelectedDate(d)}
              t={t}
            />
          </>
        )}

        <div className={cn(hideCalendar ? 'space-y-1' : 'border-t border-border pt-2 space-y-1')}>
          {/* Time */}
          <ScheduleRow
            icon={<Clock className="w-4 h-4 text-muted-foreground" />}
            label={t('activityForm.dateTimeRow.time')}
            value={timeChipValue}
            open={isRowOpen('time')}
            forceOpen={!!forceOpenRows}
            onClick={() => toggleRow('time')}
          >
            <div className="pt-2 space-y-2">
              {isReminder ? (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 shrink-0">
                    {t('activityForm.hour')} <span className="text-primary font-bold">*</span>
                  </label>
                  <TimePicker value={startTime} onChange={handleStartTimeChange} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground shrink-0">
                      {t('activityForm.startTime')}
                    </label>
                    <TimePicker value={startTime} onChange={handleStartTimeChange} />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground shrink-0">
                      {t('activityForm.endTime')}
                    </label>
                    <div>
                      <TimePicker value={endTime} onChange={handleEndTimeChange} />
                      {endTimeError && (
                        <p className="text-xs text-destructive mt-1">{t('activityForm.endAfterStart')}</p>
                      )}
                    </div>
                  </div>
                  {startTime && (
                    <button
                      type="button"
                      onClick={() => { setStartTime(''); setEndTime(''); setEndTimeError(false) }}
                      className="text-xs text-muted-foreground hover:text-destructive underline"
                    >
                      {t('common.clear')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </ScheduleRow>

          {/* Reminder */}
          <ScheduleRow
            icon={<Bell className="w-4 h-4 text-muted-foreground" />}
            label={t('activityForm.dateTimeRow.reminder')}
            value={remindersChipValue}
            open={isRowOpen('reminder')}
            forceOpen={!!forceOpenRows}
            onClick={() => toggleRow('reminder')}
          >
            <div className="pt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {t('activityForm.remindersHelp')}
              </p>

              {isPastNonRecurring && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                  {t('activityForm.pastReminderNotice')}
                </p>
              )}

              {reminderOffsets.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  {t('activityForm.chip.noReminders')}
                </p>
              )}

              {reminderOffsets.map((offset, idx) => {
                const willFire = isPastNonRecurring ? false : offsetWillFire(offset)
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className={cn('flex items-center gap-2', isPastNonRecurring && 'opacity-60 pointer-events-none')}>
                      <div className="flex-1 min-w-0">
                        <CustomSelect
                          value={String(offset)}
                          onChange={(v) => updateReminderOffset(idx, Number(v))}
                          options={REMINDER_PRESETS.map(p => ({
                            value: String(p),
                            label: formatReminderOffset(p),
                          }))}
                        />
                      </div>
                      <button type="button"
                        onClick={() => removeReminderOffset(idx)}
                        disabled={isPastNonRecurring}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        aria-label={t('common.remove')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {!isPastNonRecurring && !willFire && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1">
                        {t('activityForm.reminderTooLate')}
                      </p>
                    )}
                  </div>
                )
              })}

              {!isPastNonRecurring && reminderOffsets.length < REMINDER_HARD_CAP && (
                <button type="button"
                  onClick={addReminderOffset}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors w-full justify-center',
                    !entitlement.isPro && reminderOffsets.length >= FREE_REMINDER_LIMIT
                      ? 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/5'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span>+ {t('activityForm.addReminder')}</span>
                  {!entitlement.isPro && reminderOffsets.length >= FREE_REMINDER_LIMIT && (
                    <Crown className="w-3 h-3 text-indigo-500" />
                  )}
                </button>
              )}
            </div>
          </ScheduleRow>

          {/* Repeat */}
          <ScheduleRow
            icon={<RepeatIcon className="w-4 h-4 text-muted-foreground" />}
            label={t('activityForm.dateTimeRow.repeat')}
            value={recurrenceChipValue}
            open={isRowOpen('repeat')}
            forceOpen={!!forceOpenRows}
            onClick={() => toggleRow('repeat')}
          >
            <div className="pt-2 space-y-3">
              <CustomSelect
                value={recurrenceType}
                onChange={(v) => {
                  const next = v as RecurrenceType
                  if (!entitlement.isPro && PRO_RECURRENCE.includes(next)) {
                    openPaywall('advanced_recurrence')
                    return
                  }
                  setRecurrenceType(next)
                }}
                ariaLabel={t('activityForm.repeatFreq')}
                options={(() => {
                  const base = [
                    { value: 'none',    label: t('activityForm.recurrence.none')    },
                    { value: 'hourly',  label: t('activityForm.recurrence.hourly')  },
                    { value: 'daily',   label: t('activityForm.recurrence.daily')   },
                    { value: 'weekly',  label: t('activityForm.recurrence.weekly')  },
                    { value: 'monthly', label: t('activityForm.recurrence.monthly') },
                    { value: 'yearly',  label: t('activityForm.recurrence.yearly')  },
                    { value: 'custom',  label: t('activityForm.recurrence.custom'),  pro: true },
                  ] as const
                  const opts: Array<{ value: RecurrenceType; label: string; pro?: boolean }> = [...base]
                  if (recurrenceType === 'weekdays') {
                    opts.splice(opts.length - 1, 0, {
                      value: 'weekdays',
                      label: t('activityForm.recurrence.weekdays'),
                      pro: true,
                    })
                  }
                  return isReminder
                    ? opts.filter(o => ['none','hourly','daily','weekly','monthly','yearly'].includes(o.value))
                    : opts
                })()}
              />

              {recurrenceType === 'hourly' && !startTime && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('activityForm.hourlyNeedsStartTime')}
                </p>
              )}

              {recurrenceType === 'custom' && (
                <div className="space-y-2">
                  <div className="flex gap-1 rounded-lg bg-muted/40 p-1 text-xs">
                    <button type="button" onClick={() => setCustomMode('interval')}
                      className={cn('flex-1 rounded-md py-1.5 font-medium transition-colors',
                        customMode === 'interval' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                    >{t('activityForm.recurrenceCustom.modeInterval')}</button>
                    <button type="button" onClick={() => setCustomMode('days')}
                      className={cn('flex-1 rounded-md py-1.5 font-medium transition-colors',
                        customMode === 'days' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                    >{t('activityForm.recurrenceCustom.modeDays')}</button>
                  </div>

                  {customMode === 'interval' ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0">{t('activityForm.recurrenceCustom.every')}</span>
                      <input type="number" min={1} max={999} value={customInterval}
                        onChange={e => setCustomInterval(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                        className="w-16 text-center rounded-lg border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring tabular-nums"
                      />
                      <div className="flex-1 min-w-0">
                        <CustomSelect
                          value={customFrequency}
                          onChange={(v) => setCustomFrequency(v as RecurrenceFrequency)}
                          options={[
                            { value: 'hour',  label: t('activityForm.recurrenceCustom.freqHour')  },
                            { value: 'day',   label: t('activityForm.recurrenceCustom.freqDay')   },
                            { value: 'week',  label: t('activityForm.recurrenceCustom.freqWeek')  },
                            { value: 'month', label: t('activityForm.recurrenceCustom.freqMonth') },
                            { value: 'year',  label: t('activityForm.recurrenceCustom.freqYear')  },
                          ]}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_LABELS.map((label, i) => (
                        <button key={i} type="button"
                          onClick={() => setDaysOfWeek(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                          className={cn('w-8 h-8 rounded-full text-xs font-medium border transition-all',
                            daysOfWeek.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40'
                          )}
                        >{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recurrenceType !== 'none' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{t('activityForm.recurrenceLimit.label')}</span>
                    <div className="flex gap-1 rounded-lg bg-muted/40 p-1 text-xs">
                      <button type="button" onClick={() => setLimitMode('count')}
                        className={cn('rounded-md px-2.5 py-1 font-medium transition-colors',
                          limitMode === 'count' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                      >{t('activityForm.recurrenceLimit.count')}</button>
                      <button type="button"
                        onClick={() => {
                          if (!entitlement.isPro) {
                            openPaywall('advanced_recurrence')
                            return
                          }
                          setLimitMode('end_date')
                        }}
                        className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                          limitMode === 'end_date' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                      >
                        <span>{t('activityForm.recurrenceLimit.endDate')}</span>
                        {!entitlement.isPro && <Crown className="w-3 h-3 text-indigo-500" />}
                      </button>
                    </div>
                  </div>

                  {limitMode === 'count' ? (
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-muted-foreground">{t('activityForm.timesCount')}</label>
                      <input type="number" min={1} max={maxRepeats} value={recurrenceCount}
                        onChange={e => setRecurrenceCount(Math.max(1, Math.min(maxRepeats, Number(e.target.value) || 1)))}
                        className="w-20 text-center rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
                      />
                    </div>
                  ) : (
                    <input type="date" value={endDate} min={selectedDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}

                  {previewCount > 1 && (
                    <p className={cn(
                      'text-[11px]',
                      previewCount >= RECURRENCE_HARD_CAP
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    )}>
                      {t(
                        previewCount >= RECURRENCE_HARD_CAP
                          ? 'activityForm.recurrencePreviewCapped'
                          : 'activityForm.recurrencePreview',
                        { count: previewCount },
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScheduleRow>
        </div>
      </div>
    )
  }

  function renderVisibilityContent() {
    return (
      <div className="space-y-2">
        {/* Description swaps based on the current selection so the user
            sees what "Private" / "Visible" actually means without having
            to hover or open a tooltip. */}
        <p className="text-[11px] text-muted-foreground">
          {isPublic ? t('activityForm.visibleHelp') : t('activityForm.privateHelp')}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setIsPublic(false)}
            className={cn(
              'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors',
              !isPublic ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-border hover:border-foreground/30',
            )}
          >
            <Lock className="w-4 h-4" />
            {t('activityForm.private')}
          </button>
          <button type="button" onClick={() => setIsPublic(true)}
            className={cn(
              'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors',
              isPublic ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-border hover:border-foreground/30',
            )}
          >
            <Eye className="w-4 h-4" />
            {t('activityForm.visible')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border-border sm:border shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col animate-scale-in rounded-t-2xl sm:rounded-2xl">
        {/* Mobile bottom-sheet drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-card/90 hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* HEADER — emoji + title (always visible) */}
          <div className="px-5 pt-5 pb-3">
            <div className={cn(
              'relative flex items-center gap-2 rounded-xl border pl-2 pr-2 py-2 transition-colors',
              titleTouched && !title.trim()
                ? 'border-destructive ring-1 ring-destructive/40'
                : 'border-input focus-within:ring-2 focus-within:ring-ring'
            )}>
              <div className="relative shrink-0">
                <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl hover:bg-muted/80 transition-colors"
                  title={t('activityForm.changeEmoji')}
                >
                  {emoji || CATEGORY_CONFIG[category].emoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-20 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-8 gap-1 w-52">
                    {EMOJIS.map(e => (
                      <button key={e} type="button"
                        onClick={ev => { ev.stopPropagation(); setEmoji(e); setShowEmojiPicker(false) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                      >{e}</button>
                    ))}
                    <button type="button"
                      onClick={ev => { ev.stopPropagation(); setEmoji(''); setShowEmojiPicker(false) }}
                      className="col-span-2 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
                    >{t('activityForm.removeEmoji')}</button>
                  </div>
                )}
              </div>
              <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
                onBlur={() => { setTitleTouched(true); setTimeout(() => setShowSuggestions(false), 150) }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={t('activityForm.titlePlaceholder')} required autoFocus
                className="flex-1 text-base font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/60 min-w-0"
              />
              <div className="relative shrink-0">
                <button type="button" onClick={() => setShowTitleEmoji(p => !p)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title={t('activityForm.insertEmoji')}
                >
                  <Smile className="w-4 h-4" />
                </button>
                {showTitleEmoji && (
                  <div className="absolute top-10 right-0 z-20 bg-popover border border-border rounded-xl p-2 shadow-lg grid grid-cols-8 gap-1 w-52">
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
                  {suggestions.map((s, i) => (
                    <button key={`${s}-${i}`} type="button"
                      onMouseDown={() => { setTitle(s); setShowSuggestions(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
            {titleTouched && !title.trim() && (
              <p className="text-xs text-destructive mt-1.5">{t('activityForm.titleRequired')}</p>
            )}

            {/* Desktop templates entry — small inline link under the title.
                Mobile gets a full chip in the chip rail below. Only shown
                when creating; editing from a template would clobber the
                user's in-progress changes. */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => { onClose(); router.push('/dashboard/templates') }}
                className="mt-2 hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                {t('templatesPage.modal.browseChip')}
              </button>
            )}
          </div>

          {/* MOBILE CHIP RAIL — opens bottom-sheets */}
          <div className="sm:hidden px-5 pb-3">
            <div className="flex flex-wrap gap-2">
              {!isEditing && (
                <ChipBtn icon={<ClipboardList className="w-3.5 h-3.5" />}
                  label={t('templatesPage.title')}
                  highlighted
                  dataTour="templates"
                  onClick={() => { onClose(); router.push('/dashboard/templates') }}
                />
              )}
              <ChipBtn icon={<Tag className="w-3.5 h-3.5" />}
                label={t('activityForm.section.type')}
                value={categoryLabel(category, locale)}
                dataTour="type"
                onClick={() => setOpenSheet('type')}
              />
              <ChipBtn icon={<CalendarIcon className="w-3.5 h-3.5" />}
                label={dateChipValue}
                value={scheduleChipSummary !== dateChipValue ? scheduleChipSummary.replace(`${dateChipValue} · `, '') : ''}
                dataTour="schedule"
                onClick={() => setOpenSheet('schedule')}
              />
              <ChipBtn icon={<Users className="w-3.5 h-3.5" />}
                label={t('activityForm.section.invitees')}
                value={inviteesChipValue}
                dataTour="invitees"
                onClick={() => setOpenSheet('invitees')}
              />
              <ChipBtn icon={isPublic ? <Eye className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                label={t('activityForm.section.visibility')}
                value={isPublic ? t('activityForm.visible') : t('activityForm.private')}
                dataTour="visibility"
                onClick={() => setIsPublic(p => !p)}
              />
            </div>
          </div>

          {/* DESKTOP — always-open sections */}
          <div className="hidden sm:block px-5 pb-3 space-y-4">
            <DesktopSection icon={<Tag className="w-4 h-4" />} title={t('activityForm.section.type')}>
              {renderTypeContent()}
            </DesktopSection>

            <DesktopSection icon={<CalendarIcon className="w-4 h-4" />} title={t('activityForm.section.dateTime')}>
              {renderScheduleContent({ forceOpenRows: true, hideCalendar: !isEditing })}
            </DesktopSection>

            <DesktopSection icon={<Users className="w-4 h-4" />} title={t('activityForm.section.invitees')}>
              {renderInviteesContent()}
            </DesktopSection>

            <DesktopSection icon={isPublic ? <Eye className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              title={t('activityForm.section.visibility')}>
              {renderVisibilityContent()}
            </DesktopSection>
          </div>
        </div>

        {/* FOOTER — status + actions */}
        <div className="flex flex-col gap-2 px-5 py-3 border-t border-border shrink-0">
          {saveError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
          )}

          {/* Status pills — desktop only. On mobile the status is changed
              via the 3-dot menu on the activity card or by cycling through
              the status icon at the left of the card; rendering the pills
              here too just adds clutter on a small viewport. The
              in-progress completion slider stays here for desktop only too
              since it's part of the same status control. */}
          {!isReminder && isEditing && (
            <div className="hidden sm:block">
              <div className="grid grid-cols-5 gap-1.5">
                {(Object.keys(STATUS_CONFIG) as ActivityStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={cn('py-1.5 px-1 rounded-lg border text-[11px] font-medium transition-all text-center',
                      status === s
                        ? cn('border-transparent', STATUS_CONFIG[s].bgColor, STATUS_CONFIG[s].textColor)
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    )}
                  >{statusLabel(s, locale)}</button>
                ))}
              </div>
              {status === 'in_progress' && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="range" min={0} max={100} value={completionPct}
                    onChange={e => setCompletionPct(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-xs tabular-nums w-10 text-right">{completionPct}%</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted transition-colors">
              {t('common.cancel')}
            </button>
            <button type="button" disabled={saving || !title.trim()}
              onClick={e => handleSubmit(e)}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving
                ? t('activityForm.saving')
                : pendingInvitees.length > 0
                  ? t('activityForm.saveAndInvite', {
                      verb: isEditing ? t('activityForm.verbSave') : t('activityForm.verbCreate'),
                      count: pendingInvitees.length,
                    })
                  : isEditing
                    ? t('activityForm.saveBtn')
                    : t('activityForm.saveBtnCreate', { category: categoryLabel(category, locale).toLowerCase() })}
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE SHEETS — rendered above the main modal */}
      <BottomSheet
        open={openSheet === 'type'}
        title={t('activityForm.section.type')}
        onClose={() => setOpenSheet(null)}
      >
        {renderTypeContent()}
      </BottomSheet>

      <BottomSheet
        open={openSheet === 'schedule'}
        title={t('activityForm.section.dateTime')}
        onClose={() => { setOpenSheet(null); setOpenScheduleRow(null) }}
      >
        {renderScheduleContent()}
      </BottomSheet>

      <BottomSheet
        open={openSheet === 'invitees'}
        title={t('activityForm.section.invitees')}
        onClose={() => setOpenSheet(null)}
      >
        {renderInviteesContent()}
      </BottomSheet>

      {/* First-run chip tour on mobile. Suppressed while a bottom sheet is
          open — the chip is hidden behind the sheet so the spotlight has
          nothing to point at. The tour resumes the next time the modal is
          opened only if the user didn't finish/skip (we persist the flag
          regardless). */}
      {showChipTour && openSheet === null && currentUser?.id && (
        <ChipTour
          userId={currentUser.id}
          tourId="activity_form_chips"
          steps={chipTourSteps}
          onDone={() => setShowChipTour(false)}
        />
      )}
    </div>
  )
}

// ─── ChipBtn — pill in the mobile rail ────────────────────────────────────────
interface ChipBtnProps {
  icon?: React.ReactNode
  label: string
  value?: string
  onClick: () => void
  /** Emphasised primary-color styling. Reserved for chips that route
   *  away from the modal (e.g. Templates) so they stand out as a separate
   *  affordance from the in-place editors (Type / Date / etc.). */
  highlighted?: boolean
  /** Stable id used by the onboarding ChipTour to locate this chip in the
   *  DOM (data-tour="<key>"). Optional — only the chips that appear in the
   *  tour need it. */
  dataTour?: string
}

function ChipBtn({ icon, label, value, onClick, highlighted, dataTour }: ChipBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={dataTour}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        highlighted
          ? 'border-primary bg-primary/10 hover:bg-primary/15'
          : 'border-border bg-card hover:border-foreground/30',
      )}
    >
      {icon && (
        <span className={cn('shrink-0', highlighted ? 'text-primary' : 'text-muted-foreground')}>
          {icon}
        </span>
      )}
      <span className={cn('font-medium', highlighted ? 'text-primary' : 'text-foreground')}>
        {label}
      </span>
      {value && <span className="text-muted-foreground truncate max-w-[160px]">{value}</span>}
    </button>
  )
}

// ─── DesktopSection — always-open card on >= sm ──────────────────────────────
function DesktopSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        <span className="text-foreground/70">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── BottomSheet — fullscreen-overlay sheet, slides up from bottom on mobile ─
// Rendered above the main modal (z-[60]) and dismisses on backdrop click.
function BottomSheet({
  open, title, onClose, children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const contentRef = useRef<HTMLDivElement>(null)

  // Keep the focused input visible when the soft keyboard opens. Two
  // independent triggers because timing varies by device:
  //   1) On focusin we delay-scroll once (covers the common case where the
  //      keyboard finishes animating within ~250ms)
  //   2) We also listen on visualViewport.resize and re-scroll whenever the
  //      visual viewport shrinks — that's the authoritative "keyboard is up
  //      now" signal on Android Capacitor (adjustResize re-emits resize as
  //      the IME finishes). Using only setTimeout misses devices where the
  //      keyboard takes >250ms to fully appear; using only the resize event
  //      misses focuses that don't change the viewport (refocus on same
  //      field, etc.). Doing both is cheap.
  useEffect(() => {
    if (!open) return
    const container = contentRef.current
    if (!container) return

    // Scroll the focused input to the center of the sheet's scroll container.
    // We compute against contentRef explicitly rather than relying on
    // Element.scrollIntoView's "nearest scrollable ancestor" heuristic,
    // which has occasionally picked the document scroller and left the
    // sheet's internal scroll untouched.
    const scrollFocusedIntoView = (input: HTMLElement) => {
      const inputRect = input.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // Where the input sits, relative to the container's *current* scrollTop.
      const inputTopInContainer = (inputRect.top - containerRect.top) + container.scrollTop
      // Aim to land the input at ~1/3 from the top of the visible area so
      // there's still room for the input's caret and any label above it.
      const target = inputTopInContainer - containerRect.height / 3
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }

    let activeInput: HTMLElement | null = null
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      if (!el || !el.matches('input, textarea, select')) return
      activeInput = el
      setTimeout(() => { if (activeInput === el) scrollFocusedIntoView(el) }, 250)
    }
    const onFocusOut = () => { activeInput = null }
    const onVVResize = () => {
      if (activeInput) scrollFocusedIntoView(activeInput)
    }

    container.addEventListener('focusin', onFocusIn)
    container.addEventListener('focusout', onFocusOut)
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    vv?.addEventListener('resize', onVVResize)
    return () => {
      container.removeEventListener('focusin', onFocusIn)
      container.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', onVVResize)
    }
  }, [open])

  // Mount/unmount via `open` so the slide-in animation re-fires every time.
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
      />
      <div className={cn(
        'relative bg-card border-border sm:border shadow-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl',
        'animate-in duration-200',
        'slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 sm:fade-in-0',
      )}>
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
          >
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MonthGrid — inline calendar for the Schedule sheet ──────────────────────
function MonthGrid({
  selectedDate, onSelect, locale,
}: {
  selectedDate: string
  onSelect: (iso: string) => void
  locale: 'es' | 'en'
}) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    try { return parseISO(selectedDate) } catch { return new Date() }
  })
  const dayLabels = weekdayShort(locale)
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(viewMonth),   { weekStartsOn: 0 }),
  })

  return (
    <div className="select-none">
      <div className="flex items-center justify-center gap-4 mb-2">
        <button type="button" onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground transition-colors flex items-center justify-center">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-semibold tabular-nums min-w-[120px] text-center">
          {format(viewMonth, 'MMMM yyyy', { locale: dateFnsLocale(locale) }).toUpperCase()}
        </div>
        <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))}
          className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground transition-colors flex items-center justify-center">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground uppercase">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const iso = format(day, 'yyyy-MM-dd')
          const isSel = iso === selectedDate
          const inMonth = isSameMonth(day, viewMonth)
          const isTd = isToday(day)
          return (
            <button key={iso} type="button" onClick={() => onSelect(iso)}
              className={cn(
                'h-9 rounded-lg text-sm flex items-center justify-center transition-colors',
                isSel
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : isTd
                    ? 'text-primary font-semibold hover:bg-muted'
                    : inMonth
                      ? 'text-foreground hover:bg-muted'
                      : 'text-muted-foreground/40 hover:bg-muted',
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── QuickPicks — Today / Tomorrow / +3 days / This Sunday ───────────────────
function QuickPicks({
  selectedDate, onPick, t,
}: {
  selectedDate: string
  onPick: (iso: string) => void
  t: (key: string, params?: Record<string, any>) => string
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const inThreeDays = format(addDays(new Date(), 3), 'yyyy-MM-dd')
  const sunday = format(nextSunday(new Date()), 'yyyy-MM-dd')

  const items: Array<{ value: string; label: string }> = [
    { value: today,        label: t('activityForm.quickPick.today') },
    { value: tomorrow,     label: t('activityForm.quickPick.tomorrow') },
    { value: inThreeDays,  label: t('activityForm.quickPick.threeDaysLater') },
    { value: sunday,       label: t('activityForm.quickPick.thisWeekend') },
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(it => (
        <button key={it.label} type="button" onClick={() => onPick(it.value)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            selectedDate === it.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/40 border-border text-foreground hover:border-foreground/30',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ─── ScheduleRow — row inside the Schedule sheet that expands on click ───────
// On desktop the parent passes forceOpen=true so the chevron is hidden and the
// row sits permanently expanded.
function ScheduleRow({
  icon, label, value, open, forceOpen, onClick, children,
}: {
  icon: React.ReactNode
  label: string
  value: string
  open: boolean
  forceOpen?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border last:border-b-0 py-1">
      <button
        type="button"
        onClick={forceOpen ? undefined : onClick}
        disabled={forceOpen}
        className={cn(
          'w-full flex items-center gap-3 px-1 py-2 rounded-lg transition-colors text-left',
          !forceOpen && 'hover:bg-muted',
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="text-sm font-medium flex-1 truncate">{label}</span>
        {!open && (
          <span className="text-xs text-muted-foreground truncate max-w-[60%]">{value}</span>
        )}
      </button>
      {open && <div className="px-1 pb-1">{children}</div>}
    </div>
  )
}

// ─── TimePicker (12h format, text inputs) ─────────────────────────────────────
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  // Parse the serialized HH:mm. The display-side strips the leading zero on
  // minutes so the field reads '5' for 5 minutes — otherwise typing '5' would
  // round-trip back to '05' and a follow-up '3' would hit maxLength=2 and be
  // dropped. The serialized output via push() still pads both sides.
  const parse = (v: string) => {
    if (!v) return { h: '', m: '', p: (new Date().getHours() >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' }
    const [hRaw, mRaw] = v.split(':')
    const h24 = parseInt(hRaw)
    return {
      h: String(h24 % 12 || 12),
      m: mRaw ? String(parseInt(mRaw)) : '',
      p: (h24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
    }
  }

  const [local, setLocal] = useState(() => parse(value))
  // While the user is mid-edit we DON'T want incoming value changes to
  // overwrite their digits — that's what caused the "5 → 05 → can't add 3"
  // glitch (the controlled input snapped back to the padded form after the
  // first push, hit maxLength on the next keystroke, dropped it). We track
  // focus state via a ref so the useEffect can early-out without
  // re-rendering.
  const focusedField = useRef<'h' | 'm' | null>(null)

  useEffect(() => {
    if (focusedField.current) return
    setLocal(parse(value))
  }, [value])

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
        onFocus={() => { focusedField.current = 'h' }}
        onBlur={() => {
          focusedField.current = null
          if (local.h) push(local.h, local.m, local.p as 'AM' | 'PM')
          // Re-sync from the now-canonical value so the field shows its
          // settled form once the user moves on.
          setLocal(parse(local.h ? `${String(parseInt(local.h)).padStart(2, '0')}:${String(parseInt(local.m) || 0).padStart(2, '0')}` : ''))
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
        onFocus={() => { focusedField.current = 'm' }}
        onBlur={() => {
          focusedField.current = null
          if (local.h) push(local.h, local.m, local.p as 'AM' | 'PM')
          // Pad to two digits on the way out — '5' becomes '05' once the
          // user is done editing, matching the canonical HH:mm display.
          setLocal(prev => ({ ...prev, m: prev.m ? String(parseInt(prev.m)).padStart(2, '0') : '' }))
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
