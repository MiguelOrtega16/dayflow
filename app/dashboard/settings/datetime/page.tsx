'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar as CalendarIcon, Clock, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { useBackButtonRoute } from '@/lib/back-button'
import { useSwipeBack } from '@/lib/swipe-back'
import { CustomSelect } from '@/components/ui/custom-select'
import {
  getUserPreferences, updateUserPreferences,
  type UserPreferences, type FirstDayOfWeek, type TimeFormat, type DateFormat,
} from '@/lib/user-preferences'

export default function DateTimeSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)

  useBackButtonRoute(() => router.push('/dashboard/settings'))
  const swipeRef = useSwipeBack(() => router.push('/dashboard/settings'))

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!userId) return
    getUserPreferences(userId).then(setPrefs).catch(err => {
      console.error('[datetime-settings] load failed', err)
    })
  }, [userId])

  // Optimistic patch — rolls back on save failure.
  const updatePref = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    if (!userId || !prefs) return
    const prev = prefs[key]
    setPrefs({ ...prefs, [key]: value })
    setError(null)
    try {
      await updateUserPreferences(userId, { [key]: value } as Partial<UserPreferences>)
    } catch (err) {
      console.error('[datetime-settings] save failed', key, err)
      setPrefs(p => p ? { ...p, [key]: prev } : p)
      setError(t('settings.dateTimePage.savingError'))
    }
  }

  return (
    <div ref={swipeRef} className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push('/dashboard/settings')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('settings.dateTimePage.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('settings.dateTimePage.title')}</h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!prefs ? (
          <PrefSkeleton />
        ) : (
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            <Row icon={<CalendarDays className="w-5 h-5 text-primary" />}
                 label={t('settings.dateTimePage.firstDayLabel')}>
              {/* CustomSelect is string-typed; we round-trip via the stored
                  string repr ('system' | '0' | '1') and parse back to the
                  FirstDayOfWeek union when writing. */}
              <CustomSelect<string>
                value={String(prefs.first_day_of_week)}
                onChange={v => {
                  const parsed: FirstDayOfWeek = v === '0' ? 0 : v === '1' ? 1 : 'system'
                  updatePref('first_day_of_week', parsed)
                }}
                options={[
                  { value: 'system', label: t('settings.dateTimePage.firstDaySystem') },
                  { value: '0',      label: t('settings.dateTimePage.firstDaySunday') },
                  { value: '1',      label: t('settings.dateTimePage.firstDayMonday') },
                ]}
                ariaLabel={t('settings.dateTimePage.firstDayLabel')}
              />
            </Row>

            <Row icon={<Clock className="w-5 h-5 text-primary" />}
                 label={t('settings.dateTimePage.timeFormatLabel')}>
              <CustomSelect<TimeFormat>
                value={prefs.time_format}
                onChange={v => updatePref('time_format', v)}
                options={[
                  { value: '12h', label: t('settings.dateTimePage.timeFormat12') },
                  { value: '24h', label: t('settings.dateTimePage.timeFormat24') },
                ]}
                ariaLabel={t('settings.dateTimePage.timeFormatLabel')}
              />
            </Row>

            <Row icon={<CalendarIcon className="w-5 h-5 text-primary" />}
                 label={t('settings.dateTimePage.dateFormatLabel')}>
              <CustomSelect<DateFormat>
                value={prefs.date_format}
                onChange={v => updatePref('date_format', v)}
                options={[
                  { value: 'system', label: t('settings.dateTimePage.dateFormatSystem') },
                  { value: 'dmy',    label: t('settings.dateTimePage.dateFormatDMY') },
                  { value: 'mdy',    label: t('settings.dateTimePage.dateFormatMDY') },
                  { value: 'ymd',    label: t('settings.dateTimePage.dateFormatYMD') },
                ]}
                ariaLabel={t('settings.dateTimePage.dateFormatLabel')}
              />
            </Row>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 text-sm font-medium">{label}</span>
      <div className="shrink-0 w-[12rem] max-w-[55%]">{children}</div>
    </div>
  )
}

function PrefSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
          <div className="w-5 h-5 rounded bg-muted shrink-0" />
          <div className="flex-1 h-4 rounded bg-muted/80" />
          <div className="w-32 h-9 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
