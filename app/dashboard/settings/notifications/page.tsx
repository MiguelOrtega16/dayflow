'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Crown, Mic, Music } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { cn } from '@/lib/utils'

// Persisted in localStorage. Per-device on purpose: the ringtone you want on
// your phone may differ from what you'd want on a tablet, and the actual
// audio piping (when we wire it) is device-local anyway.
const LS_REMINDER_TYPE = 'dayflow:reminderType'
const LS_RINGTONE      = 'dayflow:ringtone'

type ReminderType = 'notification' | 'alarm'

const RINGTONE_KEYS = ['system', 'gentle', 'chime', 'digital', 'marimba', 'bell'] as const
type Ringtone = typeof RINGTONE_KEYS[number]

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

  // Read persisted prefs once.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const rt = localStorage.getItem(LS_REMINDER_TYPE) as ReminderType | null
    const rg = localStorage.getItem(LS_RINGTONE) as Ringtone | null
    if (rt === 'notification' || rt === 'alarm') setReminderType(rt)
    if (rg && (RINGTONE_KEYS as readonly string[]).includes(rg)) setRingtone(rg as Ringtone)
  }, [])

  const updateReminderType = (next: ReminderType) => {
    setReminderType(next)
    localStorage.setItem(LS_REMINDER_TYPE, next)
  }

  const updateRingtone = (next: Ringtone) => {
    setRingtone(next)
    localStorage.setItem(LS_RINGTONE, next)
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
            content based on platform. */}
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
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
                  onClick={() => updateReminderType('notification')}
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
                  onClick={() => updateReminderType('alarm')}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm text-left transition-colors relative',
                    reminderType === 'alarm'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  <span className="block">{t('notifSettings.taskReminder.typeAlarm')}</span>
                  <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">
                    {t('notifSettings.taskReminder.alarmComingSoon')}
                  </span>
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
                      onClick={() => updateRingtone(r)}
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
