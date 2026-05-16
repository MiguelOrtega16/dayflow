'use client'

import { format } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import { useI18n } from './I18nProvider'
import type { Locale } from './types'

export type DateFormatKind =
  | 'full'        // e.g. "Friday, May 16, 2026" / "viernes, 16 de mayo de 2026"
  | 'long'        // "May 16, 2026" / "16 de mayo de 2026"
  | 'dayMonthLong'// "May 16" / "16 de mayo"
  | 'dayMonthShort'// "May 16" / "16 may"
  | 'monthYear'   // "May 2026" / "mayo 2026"
  | 'weekday'     // "Friday" / "viernes"
  | 'weekdayShort'// "Fri" / "vie"
  | 'dayOnly'     // "16" (locale-independent)
  | 'short'       // "5/16/2026" / "16/05/2026"

const FORMATS_EN: Record<DateFormatKind, string> = {
  full: "EEEE, MMMM d, yyyy",
  long: "MMMM d, yyyy",
  dayMonthLong: "MMMM d",
  dayMonthShort: "MMM d",
  monthYear: "MMMM yyyy",
  weekday: 'EEEE',
  weekdayShort: 'EEE',
  dayOnly: 'd',
  short: 'M/d/yyyy',
}

const FORMATS_ES: Record<DateFormatKind, string> = {
  full: "EEEE, d 'de' MMMM 'de' yyyy",
  long: "d 'de' MMMM 'de' yyyy",
  dayMonthLong: "d 'de' MMMM",
  dayMonthShort: "d MMM",
  monthYear: 'MMMM yyyy',
  weekday: 'EEEE',
  weekdayShort: 'EEE',
  dayOnly: 'd',
  short: 'd/M/yyyy',
}

export function dateFnsLocale(locale: Locale): DateFnsLocale {
  return locale === 'en' ? enUS : es
}

export function formatDate(date: Date | number, kind: DateFormatKind, locale: Locale): string {
  const fmt = locale === 'en' ? FORMATS_EN[kind] : FORMATS_ES[kind]
  return format(date, fmt, { locale: dateFnsLocale(locale) })
}

export function useDateFnsLocale() {
  const { locale } = useI18n()
  return dateFnsLocale(locale)
}

export function useFormatDate() {
  const { locale } = useI18n()
  return (date: Date | number, kind: DateFormatKind) => formatDate(date, kind, locale)
}

// Localized weekday headers used in calendar grids (Sun→Sat).
const WEEKDAY_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_NARROW_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const WEEKDAY_NARROW_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function weekdayShort(locale: Locale): string[] {
  return locale === 'en' ? WEEKDAY_SHORT_EN : WEEKDAY_SHORT_ES
}

export function weekdayNarrow(locale: Locale): string[] {
  return locale === 'en' ? WEEKDAY_NARROW_EN : WEEKDAY_NARROW_ES
}
