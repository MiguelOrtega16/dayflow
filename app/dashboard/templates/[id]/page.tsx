'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useBackButtonRoute } from '@/lib/back-button'
import { createClient } from '@/lib/supabase/client'
import { createRecurringActivities } from '@/lib/api'
import { getTemplate } from '@/lib/activity-templates'
import type { Activity, RecurrenceType, RecurrenceConfig } from '@/types'
import { cn } from '@/lib/utils'

// 0 = Sunday … 6 = Saturday. Order matches the screenshot's chip rail.
const DAYS: { v: number; key: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' }[] = [
  { v: 0, key: 'sun' }, { v: 1, key: 'mon' }, { v: 2, key: 'tue' },
  { v: 3, key: 'wed' }, { v: 4, key: 'thu' }, { v: 5, key: 'fri' }, { v: 6, key: 'sat' },
]

// Templates use a 1-month rolling cap so adding one doesn't bury the calendar
// in ~500 ghost rows. Users who want longer-running habits can re-add or use
// the form modal to set explicit count/end-date.
const TEMPLATE_RECURRENCE_DAYS = 30

function pickRecurrence(days: number[], endDate: string): { type: RecurrenceType; config: RecurrenceConfig } {
  const sorted = [...days].sort((a, b) => a - b)
  const allSeven = sorted.length === 7
  const isMonFri = sorted.length === 5 && sorted.every((d, i) => d === i + 1)
  if (allSeven) return { type: 'daily',    config: { interval: 1, end_date: endDate } }
  if (isMonFri) return { type: 'weekdays', config: { end_date: endDate } }
  return { type: 'custom', config: { days_of_week: sorted, end_date: endDate } }
}

export default function TemplateDetailPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const template = useMemo(() => getTemplate(params.id), [params.id])

  // Hardware back returns to the templates list.
  useBackButtonRoute(() => router.push('/dashboard/templates'))

  // Form state — seeded from the template's defaults. Once the user lands on
  // this page they're editing; the catalog stays untouched.
  const [phrase, setPhrase] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [reminderTimes, setReminderTimes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!template) return
    setPhrase(t(`templates.${template.id}.phrase`))
    setSelectedDays(template.defaults.days_of_week)
    setReminderTimes(template.defaults.reminder_times)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, t])

  if (!template) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>404</p>
      </div>
    )
  }

  const toggleDay = (v: number) => {
    setSelectedDays(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v].sort((a, b) => a - b),
    )
    setError(null)
  }

  const updateTime = (idx: number, value: string) => {
    setReminderTimes(prev => prev.map((t, i) => (i === idx ? value : t)))
  }

  const removeTime = (idx: number) => {
    setReminderTimes(prev => prev.filter((_, i) => i !== idx))
  }

  const addTime = () => {
    // Suggest a new time one hour after the last one to avoid duplicates.
    const last = reminderTimes[reminderTimes.length - 1] ?? '09:00'
    const [h, m] = last.split(':').map(Number)
    const next = String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0')
    setReminderTimes(prev => [...prev, next])
  }

  const handleSubmit = async () => {
    if (selectedDays.length === 0) {
      setError(t('templatesPage.detail.atLeastOneDay'))
      return
    }
    if (reminderTimes.length === 0) {
      setError(t('templatesPage.detail.atLeastOneTime'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('not authenticated')

      const today = format(new Date(), 'yyyy-MM-dd')
      const endDate = format(addDays(new Date(), TEMPLATE_RECURRENCE_DAYS), 'yyyy-MM-dd')
      const recurrence = pickRecurrence(selectedDays, endDate)
      const title       = t(`templates.${template.id}.name`)
      const description = t(`templates.${template.id}.description`)

      // One recurring activity per reminder time. Same title / phrase /
      // recurrence pattern, different start_time. Reminder fires AT
      // start_time via reminder_offsets=[0].
      for (const time of reminderTimes) {
        const base: Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'profile' | 'goal'> = {
          user_id:               user.id,
          title,
          description,
          date:                  today,
          status:                'todo',
          priority:              'medium',
          category:              template.defaults.activity_category,
          goal_id:               null,
          tags:                  [],
          color:                 null,
          emoji:                 template.emoji,
          start_time:            time,
          end_time:              null,
          recurrence_type:       recurrence.type,
          recurrence_config:     recurrence.config,
          reminder_offsets:      [0],
          reminder_phrase:       phrase || null,
          parent_activity_id:    null,
          is_public:             false,
          notes:                 null,
          completion_percentage: 0,
        }
        await createRecurringActivities(base, recurrence.type, recurrence.config)
      }

      setDone(true)
      setTimeout(() => router.push('/dashboard'), 700)
    } catch (err) {
      console.error('[templates] add failed', err)
      setError(t('templatesPage.detail.errorAdding'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push('/dashboard/templates')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('templatesPage.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold truncate">{t(`templates.${template.id}.name`)}</h1>
      </header>

      <div className="p-5 max-w-lg mx-auto w-full space-y-6">
        {/* Hero emoji + description */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="text-6xl leading-none" aria-hidden>{template.emoji}</div>
          <p className="text-sm text-muted-foreground">
            {t(`templates.${template.id}.description`)}
          </p>
        </div>

        {/* Reminder phrase */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold">{t('templatesPage.detail.reminderPhrase')}</label>
          <input
            type="text"
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Repeat on */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold">{t('templatesPage.detail.repeatOn')}</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(d => {
              const active = selectedDays.includes(d.v)
              return (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => toggleDay(d.v)}
                  className={cn(
                    'min-w-[44px] h-11 px-3 rounded-full text-xs font-medium transition-colors border-2',
                    active
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  {t(`templatesPage.detail.dayShort.${d.key}`)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Reminder at — one row per time, plus an add button. */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold">{t('templatesPage.detail.reminderAt')}</label>
          <div className="flex flex-wrap gap-2 items-center">
            {reminderTimes.map((time, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-card pl-3 pr-1 h-11"
              >
                {/* Native time input — the rendered width has to fit
                    "12:00 AM" (the 12-hour locale form) plus the
                    browser-drawn spinner; the 7ch we had was clipping the
                    AM/PM to "A" / "P" on both PC and mobile. min-w gives
                    a floor; flex-1-friendly inputs can still grow. */}
                <input
                  type="time"
                  value={time}
                  onChange={e => updateTime(idx, e.target.value)}
                  className="bg-transparent text-sm outline-none tabular-nums min-w-[7.5rem]"
                />
                <button
                  type="button"
                  onClick={() => removeTime(idx)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={t('templatesPage.detail.addReminderTime')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addTime}
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              aria-label={t('templatesPage.detail.addReminderTime')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* CTA */}
        <div className="pt-2 pb-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || done}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {done
              ? t('templatesPage.detail.added')
              : busy
                ? t('templatesPage.detail.adding')
                : t('templatesPage.detail.addToList')}
          </button>
        </div>
      </div>
    </div>
  )
}
