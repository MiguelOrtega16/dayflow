'use client'

/**
 * Provides the user's date/time display preferences (first day of week,
 * 12h vs 24h, date format) to the React tree, plus formatter hooks that
 * apply them. Loads from profiles.preferences on auth state, falls back
 * to locale defaults until the fetch resolves so first paint has no
 * lock-in to the wrong format.
 *
 * Why a dedicated provider (vs. extending I18nProvider): these prefs are
 * per-user and DB-backed, while the i18n locale is per-device and
 * localStorage-backed. Different lifecycles. Keeping them separate makes
 * each one's responsibilities obvious.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { format as fnsFormat } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import {
  normalizePreferences,
  type DateFormat, type FirstDayOfWeek, type TimeFormat,
} from '@/lib/user-preferences'

interface DateTimePrefsValue {
  firstDayOfWeek: FirstDayOfWeek
  timeFormat:     TimeFormat
  dateFormat:     DateFormat
  loading:        boolean
  /** Returns the date-fns weekStartsOn value (0=Sun, 1=Mon) after resolving
   *  'system' against the current locale. */
  resolveWeekStart: () => 0 | 1
  /** Formats a 'HH:mm' (24-hour clock) string per the current preference. */
  formatTime: (hhmm: string | null | undefined) => string
  /** Formats a Date (or yyyy-MM-dd string) per the current preference.
   *  'short' = 12/24-numeric form (DD/MM/YYYY etc.). */
  formatShortDate: (d: Date | string | number) => string
}

const DEFAULT: DateTimePrefsValue = {
  firstDayOfWeek:   'system',
  timeFormat:       '12h',
  dateFormat:       'system',
  loading:          true,
  resolveWeekStart: () => 0,
  formatTime:       (t) => t ?? '',
  formatShortDate:  (d) => String(d),
}

const DateTimePrefsContext = createContext<DateTimePrefsValue>(DEFAULT)

export function useDateTimePrefs() {
  return useContext(DateTimePrefsContext)
}

export function DateTimePrefsProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const [firstDayOfWeek, setFirstDay] = useState<FirstDayOfWeek>('system')
  const [timeFormat, setTimeFmt]      = useState<TimeFormat>('12h')
  const [dateFormat, setDateFmt]      = useState<DateFormat>('system')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const apply = async (userId: string | null) => {
      if (!userId) { if (!cancelled) setLoading(false); return }
      try {
        const { data } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', userId)
          .single()
        if (cancelled) return
        const prefs = normalizePreferences(data?.preferences)
        setFirstDay(prefs.first_day_of_week)
        setTimeFmt(prefs.time_format)
        setDateFmt(prefs.date_format)
      } catch {
        // Missing preferences column / network fail → keep defaults.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        apply(session?.user?.id ?? null)
      } else if (event === 'SIGNED_OUT') {
        // Reset to defaults on sign-out — next user shouldn't inherit prior prefs.
        setFirstDay('system')
        setTimeFmt('12h')
        setDateFmt('system')
        setLoading(false)
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  // Resolve 'system' against the current i18n locale: ES → Monday (1),
  // EN → Sunday (0). Adjust here if more locales are added.
  const resolveWeekStart = useCallback((): 0 | 1 => {
    if (firstDayOfWeek === 0 || firstDayOfWeek === 1) return firstDayOfWeek
    return locale === 'es' ? 1 : 0
  }, [firstDayOfWeek, locale])

  const formatTime = useCallback((hhmm: string | null | undefined): string => {
    if (!hhmm) return ''
    const [hStr, mStr] = hhmm.split(':')
    const h = parseInt(hStr)
    if (isNaN(h)) return ''
    const m = (mStr ?? '00').padStart(2, '0')
    if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:${m}`
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12  = h % 12 || 12
    return `${h12}:${m} ${ampm}`
  }, [timeFormat])

  // 'system' falls back to the locale: en → MDY, es → DMY.
  const formatShortDate = useCallback((d: Date | string | number): string => {
    const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : new Date(d)
    let fmt = dateFormat
    if (fmt === 'system') fmt = locale === 'es' ? 'dmy' : 'mdy'
    const pattern = fmt === 'dmy' ? 'dd/MM/yyyy'
                  : fmt === 'mdy' ? 'MM/dd/yyyy'
                  :                 'yyyy-MM-dd'
    return fnsFormat(date, pattern)
  }, [dateFormat, locale])

  return (
    <DateTimePrefsContext.Provider
      value={{ firstDayOfWeek, timeFormat, dateFormat, loading, resolveWeekStart, formatTime, formatShortDate }}
    >
      {children}
    </DateTimePrefsContext.Provider>
  )
}
