'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Crown, Mic, Music } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { cn } from '@/lib/utils'
import {
  getUserPreferences, updateUserPreferences,
  type ReminderType, type Ringtone,
} from '@/lib/user-preferences'

const RINGTONE_KEYS: readonly Ringtone[] = ['system', 'gentle', 'chime', 'digital', 'marimba', 'bell']

export default function NotificationsSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { entitlement } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()

  const [isNative, setIsNative] = useState(false)
  const [reminderType, setReminderType] = useState<ReminderType>('notification')
  const [ringtone, setRingtone] = useState<Ringtone>('system')

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Load persisted prefs from the user's profile (the cron reads from this
  // same column to route Alarm-type pushes to the high-importance channel).
  useEffect(() => {
    if (!userId) return
    getUserPreferences(userId)
      .then(prefs => {
        setReminderType(prefs.reminder_type)
        setRingtone(prefs.ringtone)
      })
      .catch(err => console.error('[notif-settings] load prefs failed', err))
  }, [userId])

  const persistReminderType = async (next: ReminderType) => {
    if (!userId) return
    const previous = reminderType
    setReminderType(next)  // optimistic
    try {
      await updateUserPreferences(userId, { reminder_type: next })
    } catch (err) {
      console.error('[notif-settings] save reminder_type failed', err)
      setReminderType(previous)  // rollback
    }
  }

  const persistRingtone = async (next: Ringtone) => {
    if (!userId) return
    const previous = ringtone
    setRingtone(next)  // optimistic
    try {
      await updateUserPreferences(userId, { ringtone: next })
    } catch (err) {
      console.error('[notif-settings] save ringtone failed', err)
      setRingtone(previous)  // rollback
    }
  }

  const handleRecordCustom = () => {
    if (!entitlement.isPro) {
      openPaywall('custom_ringtone')
      return
    }
    // TODO: native recording flow (separate phase — UI stub only for now).
  }

  const handlePickFromMusic = () => {
    if (!entitlement.isPro) {
      openPaywall('custom_ringtone')
      return
    }
    // TODO: native file picker (separate phase — UI stub only for now).
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
        {/* Troubleshoot row — same on mobile + desktop, page renders different
            content based on platform. Right-aligned info icon (instead of the
            usual chevron) signals "tap to learn more" rather than "more
            settings inside". */}
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

        {/* Mobile-only: Default Reminder Type + Ringtone. The actual native
            wiring (alarm sound, ringtone playback) is a follow-up; for now
            these persist the user's choice in localStorage. */}
        {isNative && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
            <h2 className="text-sm font-semibold">{t('notifSettings.taskReminder.sectionHeading')}</h2>

            {/* Default Task Reminder Type */}
            <div>
              <p className="text-sm font-medium">{t('notifSettings.taskReminder.defaultTypeLabel')}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('notifSettings.taskReminder.defaultTypeSub')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => persistReminderType('notification')}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm text-left transition-colors',
                    reminderType === 'notification'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  {t('notifSettings.taskReminder.typeNotification')}
                </button>
                <button
                  type="button"
                  onClick={() => persistReminderType('alarm')}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm text-left transition-colors relative',
                    reminderType === 'alarm'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  {t('notifSettings.taskReminder.typeAlarm')}
                </button>
              </div>
            </div>

            {/* Default Ringtone */}
            <div>
              <p className="text-sm font-medium">{t('notifSettings.taskReminder.defaultRingtoneLabel')}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('notifSettings.taskReminder.defaultRingtoneSub')}</p>

              <div className="space-y-1">
                {RINGTONE_KEYS.map(r => {
                  const sel = ringtone === r
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => persistRingtone(r)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors',
                        sel
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border hover:border-foreground/30',
                      )}
                    >
                      <span className={cn(
                        'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                        sel ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                      )} />
                      <span className="flex-1">{t(`notifSettings.taskReminder.ringtones.${r}`)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Pro options */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ProRingtoneButton
                  icon={<Mic className="w-4 h-4" />}
                  label={t('notifSettings.taskReminder.recordCustom')}
                  isPro={entitlement.isPro}
                  onClick={handleRecordCustom}
                />
                <ProRingtoneButton
                  icon={<Music className="w-4 h-4" />}
                  label={t('notifSettings.taskReminder.pickFromMusic')}
                  isPro={entitlement.isPro}
                  onClick={handlePickFromMusic}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProRingtoneButton({
  icon, label, isPro, onClick,
}: {
  icon: React.ReactNode
  label: string
  isPro: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors',
        isPro
          ? 'border-border hover:border-foreground/30'
          : 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/5',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {!isPro && <Crown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
    </button>
  )
}
