import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ActivityStatus, ActivityPriority, ActivityCategory } from "@/types"
import { getMessage, interpolate, DEFAULT_LOCALE, type Locale } from "@/lib/i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Status / category / priority configs hold visual data only. Labels live in
// i18n; resolve them with `statusLabel(status, locale)` etc., or with the
// `useStatusLabel` hooks below from React components.
export const STATUS_CONFIG: Record<ActivityStatus, {
  color: string
  bgColor: string
  textColor: string
  dotColor: string
}> = {
  todo: {
    color: 'border-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-600/40',
    textColor: 'text-slate-700 dark:text-slate-200',
    dotColor: 'bg-slate-400',
  },
  in_progress: {
    color: 'border-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-500/25',
    textColor: 'text-amber-800 dark:text-amber-300',
    dotColor: 'bg-amber-500',
  },
  done: {
    color: 'border-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-600/25',
    textColor: 'text-emerald-800 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  blocked: {
    color: 'border-red-400',
    bgColor: 'bg-red-50 dark:bg-red-600/25',
    textColor: 'text-red-800 dark:text-red-300',
    dotColor: 'bg-red-500',
  },
  skipped: {
    color: 'border-gray-500',
    bgColor: 'bg-gray-200 dark:bg-gray-600',
    textColor: 'text-gray-600 dark:text-gray-100',
    dotColor: 'bg-gray-500',
  },
}

export const PRIORITY_CONFIG: Record<ActivityPriority, {
  color: string
  icon: string
}> = {
  low: { color: 'text-blue-500', icon: '▽' },
  medium: { color: 'text-yellow-500', icon: '◇' },
  high: { color: 'text-orange-500', icon: '▲' },
  critical: { color: 'text-red-600', icon: '⬆' },
}

export const CATEGORY_CONFIG: Record<ActivityCategory, {
  emoji: string
  color: string
}> = {
  task:     { emoji: '✓',  color: 'text-blue-600'   },
  habit:    { emoji: '🔄', color: 'text-green-600'  },
  event:    { emoji: '📅', color: 'text-orange-600' },
  note:     { emoji: '📝', color: 'text-gray-600'   },
  reminder: { emoji: '🔔', color: 'text-purple-600' },
}

export function statusLabel(s: ActivityStatus, locale: Locale = DEFAULT_LOCALE) {
  return getMessage(locale, `status.${s}`) ?? s
}
export function categoryLabel(c: ActivityCategory, locale: Locale = DEFAULT_LOCALE) {
  return getMessage(locale, `category.${c}`) ?? c
}
export function priorityLabel(p: ActivityPriority, locale: Locale = DEFAULT_LOCALE) {
  return getMessage(locale, `priority.${p}`) ?? p
}

// Profile accent colors. Free users get the first four; Pro unlocks the rest.
// The full list is still exported as USER_COLORS for renderers that need to
// resolve a stored color regardless of tier (e.g. the sidebar avatar).
// Keep in sync with the RLS check on profiles.color in schema.sql.
export const FREE_USER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
] as const

export const PRO_USER_COLORS = [
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#a855f7', '#ef4444',
] as const

export const USER_COLORS = [...FREE_USER_COLORS, ...PRO_USER_COLORS]

export function isProColor(hex: string): boolean {
  return (PRO_USER_COLORS as readonly string[]).includes(hex)
}

export function getInitials(name: string | null | undefined, email?: string): string {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }
  return (email || '?')[0].toUpperCase()
}

export function formatTime(time: string | null): string {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${ampm}`
}

export function formatRelativeTime(dateStr: string, locale: Locale = DEFAULT_LOCALE): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  const t = (key: string, vars?: Record<string, string | number>) =>
    interpolate(getMessage(locale, key) ?? key, vars)

  if (diffSecs < 60) return t('relativeTime.justNow')
  if (diffMins < 60) return t('relativeTime.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('relativeTime.hoursAgo', { count: diffHours })
  if (diffDays === 1) return t('relativeTime.yesterday')
  if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays })
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' })
}
