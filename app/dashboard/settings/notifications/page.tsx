'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  getUserPreferences, updateUserPreferences,
  type ReminderType,
} from '@/lib/user-preferences'

export default function NotificationsSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  const [isNative, setIsNative] = useState(false)
  const [reminderType, setReminderType] = useState<ReminderType>('notification')
  const [saveError, setSaveError] = useState<string | null>(null)

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
      .then(prefs => setReminderType(prefs.reminder_type))
      .catch(err => console.error('[notif-settings] load prefs failed', err))
  }, [userId])

  // Translate Supabase / Postgres errors into something users can act on.
  // The most common cause when nothing else changed is the schema migration
  // for the `preferences` column hasn't been applied yet — surface that
  // explicitly so the user knows to run the migration.
  const errorMessage = (err: unknown): string => {
    const msg = String((err as { message?: string })?.message ?? err ?? '')
    if (msg.includes('preferences') && msg.includes('column')) {
      return t('notifSettings.errors.missingColumn')
    }
    return msg || t('notifSettings.errors.generic')
  }

  const persistReminderType = async (next: ReminderType) => {
    if (!userId) return
    const previous = reminderType
    setReminderType(next)  // optimistic
    setSaveError(null)
    try {
      await updateUserPreferences(userId, { reminder_type: next })
    } catch (err) {
      console.error('[notif-settings] save reminder_type failed', err)
      setReminderType(previous)  // rollback
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

        {/* Mobile-only: Default Reminder Type. Alarm routes notifications
            through the higher-importance Android channel. Ringtone selection
            used to live here but was dropped — per-channel Android sound
            requires bundling N audio files and creating N channels per type,
            which clutters the user's app notification settings for limited
            value. The reminder's actual sound is whatever the channel default
            is on the device. */}
        {isNative && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold">{t('notifSettings.taskReminder.sectionHeading')}</h2>

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
                    'rounded-xl border px-3 py-2.5 text-sm text-left transition-colors',
                    reminderType === 'alarm'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  {t('notifSettings.taskReminder.typeAlarm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
