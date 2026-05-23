'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Crown } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { CustomSelect } from '@/components/ui/custom-select'
import { cn } from '@/lib/utils'
import { useBackButtonRoute } from '@/lib/back-button'
import { useSwipeBack } from '@/lib/swipe-back'
import {
  getUserPreferences, updateUserPreferences,
  type UserPreferences, type ReminderType, type SnoozeMinutes, type DailySlot,
} from '@/lib/user-preferences'

const SNOOZE_OPTIONS: SnoozeMinutes[] = [5, 15, 30]
// Morning hours pickable on the Pro custom-time mode. 5 AM .. 11 AM.
const MORNING_HOURS = [5, 6, 7, 8, 9, 10, 11]
// Evening hours pickable on the Pro custom-time mode. 5 PM .. 11 PM.
const EVENING_HOURS = [17, 18, 19, 20, 21, 22, 23]

function formatHour12(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:00 ${ampm}`
}

export default function NotificationsSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { entitlement } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()

  const [isNative, setIsNative] = useState(false)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Hardware back returns to the main settings page instead of the
  // quit-app confirm.
  useBackButtonRoute(() => router.push('/dashboard/settings'))
  useSwipeBack(() => router.push('/dashboard/settings'))

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Load persisted prefs from the user's profile.
  useEffect(() => {
    if (!userId) return
    getUserPreferences(userId)
      .then(setPrefs)
      .catch(err => console.error('[notif-settings] load prefs failed', err))
  }, [userId])

  // Translate Supabase / Postgres errors into something users can act on.
  const errorMessage = (err: unknown): string => {
    const msg = String((err as { message?: string })?.message ?? err ?? '')
    if (msg.includes('preferences') && msg.includes('column')) {
      return t('notifSettings.errors.missingColumn')
    }
    return msg || t('notifSettings.errors.generic')
  }

  // Generic optimistic-update helper. Patches one field, rolls back on
  // failure. Returns void; consumers don't await it.
  const updatePref = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    if (!userId || !prefs) return
    const previous = prefs[key]
    setPrefs({ ...prefs, [key]: value })
    setSaveError(null)
    try {
      await updateUserPreferences(userId, { [key]: value } as Partial<UserPreferences>)
    } catch (err) {
      console.error('[notif-settings] save failed', key, err)
      setPrefs(p => p ? { ...p, [key]: previous } : p)
      setSaveError(errorMessage(err))
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('notifSettings.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('notifSettings.title')}</h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {saveError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        {/* Troubleshoot row — always available regardless of pref load state. */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => router.push('/dashboard/settings/notifications/troubleshoot')}
            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{t('notifSettings.troubleshoot.rowLabel')}</span>
              <span className="block text-xs text-muted-foreground truncate">{t('notifSettings.troubleshoot.rowSub')}</span>
            </span>
            <Info className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>

        {/* Skeleton while prefs load — prevents "Notification" flashing on
            screen for users who had Alarm selected. */}
        {prefs === null ? (
          <>
            {isNative && <PrefSectionSkeleton rows={3} />}
            <PrefSectionSkeleton rows={2} />
          </>
        ) : (
          <>
            {/* Mobile-only: Task reminder type + screenlock + snooze */}
            {isNative && (
              <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
                <h2 className="text-sm font-semibold">{t('notifSettings.taskReminder.sectionHeading')}</h2>

                {/* Default Task Reminder Type */}
                <div>
                  <p className="text-sm font-medium">{t('notifSettings.taskReminder.defaultTypeLabel')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('notifSettings.taskReminder.defaultTypeSub')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['notification', 'alarm'] as ReminderType[]).map(rt => {
                      const sel = prefs.reminder_type === rt
                      return (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => updatePref('reminder_type', rt)}
                          className={cn(
                            'rounded-xl border px-3 py-2.5 text-sm text-left transition-colors',
                            sel ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:border-foreground/30',
                          )}
                        >
                          {t(`notifSettings.taskReminder.type${rt === 'alarm' ? 'Alarm' : 'Notification'}`)}
                        </button>
                      )
                    })}
                  </div>
                  {/* Surface the actual behavioral difference whenever Alarm
                      is the active choice — otherwise the two buttons look
                      interchangeable on modern Android. */}
                  {prefs.reminder_type === 'alarm' && (
                    <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                      {t('notifSettings.taskReminder.alarmExplain')}
                    </p>
                  )}
                </div>

                {/* Screenlock toggle */}
                <ToggleRow
                  label={t('notifSettings.taskReminder.screenlockLabel')}
                  sub={t('notifSettings.taskReminder.screenlockSub')}
                  on={prefs.screenlock_reminders}
                  onChange={v => updatePref('screenlock_reminders', v)}
                />

                {/* Snooze toggle + duration — hidden for now; not in active
                    development. Underlying preference (snooze_enabled /
                    snooze_minutes) is preserved so existing saved values
                    aren't lost, and the UI can be re-enabled by removing
                    the false guard below when the feature ships.
                {false && (
                  <div>
                    <ToggleRow
                      label={t('notifSettings.taskReminder.snoozeLabel')}
                      sub={t('notifSettings.taskReminder.snoozeSub')}
                      on={prefs.snooze_enabled}
                      onChange={v => updatePref('snooze_enabled', v)}
                    />
                    {prefs.snooze_enabled && (
                      <div className="mt-3 pl-1">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                          {t('notifSettings.taskReminder.snoozeDurationLabel')}
                        </label>
                        <CustomSelect<string>
                          value={String(prefs.snooze_minutes)}
                          onChange={v => updatePref('snooze_minutes', Number(v) as SnoozeMinutes)}
                          options={SNOOZE_OPTIONS.map(m => ({
                            value: String(m),
                            label: t(`notifSettings.taskReminder.snoozeMin.${m}`),
                          }))}
                        />
                        <p className="text-[11px] text-muted-foreground mt-2">
                          {t('notifSettings.taskReminder.snoozeNote')}
                        </p>
                      </div>
                    )}
                  </div>
                )} */}
              </div>
            )}

            {/* Daily reminders — visible on both web + mobile, since the
                cron fires push to whichever subscription the user has. */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <h2 className="text-sm font-semibold">{t('notifSettings.daily.sectionHeading')}</h2>

              <DailySlotPicker
                label={t('notifSettings.daily.morningLabel')}
                sub={t('notifSettings.daily.morningSub')}
                value={prefs.morning_reminder}
                onChange={v => updatePref('morning_reminder', v)}
                hours={MORNING_HOURS}
                defaultHour={7}
                isPro={entitlement.isPro}
                onProGate={() => openPaywall('custom_reminders')}
                t={t}
                kind="morning"
              />

              <DailySlotPicker
                label={t('notifSettings.daily.eveningLabel')}
                sub={t('notifSettings.daily.eveningSub')}
                value={prefs.evening_review}
                onChange={v => updatePref('evening_review', v)}
                hours={EVENING_HOURS}
                defaultHour={20}
                isPro={entitlement.isPro}
                onProGate={() => openPaywall('custom_reminders')}
                t={t}
                kind="evening"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Toggle row ──────────────────────────────────────────────────────────────
function ToggleRow({
  label, sub, on, onChange,
}: {
  label: string
  sub?: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          'shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
            on ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

// ─── Daily slot picker (Default / Custom Pro / Off) ─────────────────────────
function DailySlotPicker({
  label, sub, value, onChange, hours, defaultHour, isPro, onProGate, t, kind,
}: {
  label: string
  sub: string
  value: DailySlot
  onChange: (v: DailySlot) => void
  hours: number[]
  defaultHour: number
  isPro: boolean
  onProGate: () => void
  t: (key: string, params?: Record<string, any>) => string
  kind: 'morning' | 'evening'
}) {
  // Three-way mode: default, custom (Pro), or off. We derive the mode from
  // the stored DailySlot value so the UI stays in sync after a remote update.
  const mode: 'default' | 'custom' | 'off' =
    value === 'default' ? 'default' :
    value === 'off'     ? 'off' :
    'custom'

  const selectCustom = () => {
    if (!isPro) { onProGate(); return }
    // Pick the user's previous custom hour if numeric, otherwise the
    // section's documented default.
    const h = typeof value === 'number' ? value : defaultHour
    onChange(h)
  }

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{sub}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <ModeButton
          active={mode === 'default'}
          onClick={() => onChange('default')}
          label={t(kind === 'morning' ? 'notifSettings.daily.optDefaultMorning' : 'notifSettings.daily.optDefaultEvening')}
        />
        <ModeButton
          active={mode === 'custom'}
          onClick={selectCustom}
          label={t('notifSettings.daily.optCustom')}
          proLocked={!isPro}
        />
        <ModeButton
          active={mode === 'off'}
          onClick={() => onChange('off')}
          label={t('notifSettings.daily.optOff')}
        />
      </div>

      {mode === 'custom' && typeof value === 'number' && (
        <div className="mt-3 pl-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {t('notifSettings.daily.hourLabel')}
          </label>
          <CustomSelect<string>
            value={String(value)}
            onChange={v => onChange(Number(v))}
            options={hours.map(h => ({ value: String(h), label: formatHour12(h) }))}
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            {t(kind === 'morning' ? 'notifSettings.daily.customMorningHelp' : 'notifSettings.daily.customEveningHelp')}
          </p>
        </div>
      )}
    </div>
  )
}

function ModeButton({
  active, onClick, label, proLocked,
}: {
  active: boolean
  onClick: () => void
  label: string
  proLocked?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm text-left transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : proLocked
            ? 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/5'
            : 'border-border hover:border-foreground/30',
      )}
    >
      <span className="truncate">{label}</span>
      {proLocked && !active && <Crown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
    </button>
  )
}

// ─── Skeleton for the loading state ─────────────────────────────────────────
function PrefSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4 animate-pulse">
      <div className="h-3.5 w-32 rounded bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="h-3 w-56 rounded bg-muted/70" />
          <div className="h-9 w-full rounded-xl bg-muted/40" />
        </div>
      ))}
    </div>
  )
}
