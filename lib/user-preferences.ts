/**
 * Typed wrapper around the profiles.preferences jsonb column.
 *
 * The column is created with default '{}' so every existing user has an
 * empty object — never null. Each getter falls back to a documented default,
 * so a profile that hasn't opened the new settings yet still behaves
 * sensibly.
 */

import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { THEMES, DEFAULT_THEME_ID } from '@/lib/themes'
import { isValidSoundId, DEFAULT_SOUND_ID } from '@/lib/notification-sounds'
import type { ActivityCategory } from '@/types'

export type ReminderType   = 'notification' | 'alarm'
export type SnoozeMinutes  = 5 | 15 | 30
/** 'system' = follow the i18n locale's convention. Numeric matches date-fns'
 *  weekStartsOn (0=Sun, 1=Mon). */
export type FirstDayOfWeek = 'system' | 0 | 1
/** 12 = 12-hour with AM/PM, 24 = 24-hour. */
export type TimeFormat = '12h' | '24h'
/** dmy = 19/05/2026, mdy = 5/19/2026, ymd = 2026-05-19. 'system' uses the i18n locale. */
export type DateFormat = 'system' | 'dmy' | 'mdy' | 'ymd'

/**
 * Morning / evening reminder slot:
 *   'default' = fire at the system default hour (7 for morning, 20 for evening)
 *   'off'     = don't fire for this user
 *   number    = fire at this hour in the user's local timezone (0..23)
 *               Custom hours are a Pro feature on the client.
 */
export type DailySlot = 'default' | 'off' | number

export interface UserPreferences {
  reminder_type:        ReminderType
  /** Show task reminder notifications on the device lock screen. */
  screenlock_reminders: boolean
  /** Whether the snooze action is offered on task reminders. */
  snooze_enabled:       boolean
  /** How long a snooze defers the reminder. */
  snooze_minutes:       SnoozeMinutes
  /** Sound played for standard push notifications. An id from
   *  lib/notification-sounds.ts; 'default' = the system notification sound.
   *  Effective on Android (each sound maps to its own notification channel);
   *  web push can't set a custom sound, so it's a no-op there. */
  notification_sound:   string
  /** Morning planning push (default 7 AM local). */
  morning_reminder:     DailySlot
  /** Evening review push (default 8 PM local). */
  evening_review:       DailySlot
  /** Accent palette id from lib/themes.ts. Non-default ids are Pro-only. */
  theme:                string
  /** Which day calendar grids and weekday rails start on. */
  first_day_of_week:    FirstDayOfWeek
  /** Used by formatTime + activity card displays. 12h by default. */
  time_format:          TimeFormat
  /** Display format for short dates. 'system' picks based on i18n locale. */
  date_format:          DateFormat
  /** Whether new activities the user creates default to "visible" (public)
   *  in shared calendars, or to "private" (only the owner sees them). The
   *  schema-level default for `activities.is_public` is already true; this
   *  preference governs the pre-selection in the new-activity form so a
   *  user who prefers privacy doesn't have to flip the toggle every time. */
  default_activity_public: boolean
  /** Calendar coloring source for activity cards and time-grid event blocks:
   *   - 'profile'  (default): owner's profile color — the long-standing UX.
   *   - 'category': the activity's category color, so the calendar reads
   *                 as "what kind of thing" at a glance.
   *  Pro feature; the Appearance toggle gates and the renderer is defensive
   *  if a free user ever ends up with 'category' set. */
  day_view_color_by: 'profile' | 'category'
  /** Pro: per-category color overrides applied when day_view_color_by is
   *  'category'. Missing keys fall back to the CATEGORY_CONFIG default hex.
   *  Stored hex must match #rrggbb — the normalizer drops anything else,
   *  so old/garbage data can't poison the inline-style render. */
  category_color_overrides: Partial<Record<ActivityCategory, string>>
  /** Whether the always-pinned "today summary" notification (with + Task /
   *  + Reminder shortcuts) is shown in the system tray. Posted on app launch
   *  and after data changes; never auto-dismisses. Android-only. */
  daily_summary_notification: boolean
}

const DEFAULTS: UserPreferences = {
  reminder_type:        'notification',
  screenlock_reminders: false,
  snooze_enabled:       true,
  snooze_minutes:       15,
  notification_sound:   DEFAULT_SOUND_ID,
  morning_reminder:     'default',
  evening_review:       'default',
  theme:                DEFAULT_THEME_ID,
  first_day_of_week:    'system',
  time_format:          '12h',
  date_format:          'system',
  default_activity_public: true,
  day_view_color_by:    'profile',
  category_color_overrides: {},
  daily_summary_notification: true,
}

function normalizeFirstDay(v: unknown): FirstDayOfWeek {
  if (v === 0 || v === 1) return v
  return 'system'
}

function normalizeTimeFormat(v: unknown): TimeFormat {
  return v === '24h' ? '24h' : '12h'
}

function normalizeDateFormat(v: unknown): DateFormat {
  if (v === 'dmy' || v === 'mdy' || v === 'ymd') return v
  return 'system'
}

function normalizeTheme(v: unknown): string {
  if (typeof v === 'string' && THEMES.some(t => t.id === v)) return v
  return DEFAULT_THEME_ID
}

function normalizeDailySlot(v: unknown): DailySlot {
  if (v === 'off') return 'off'
  if (typeof v === 'number' && v >= 0 && v <= 23) return Math.floor(v)
  return 'default'
}

function normalizeSnoozeMinutes(v: unknown): SnoozeMinutes {
  if (v === 5 || v === 15 || v === 30) return v
  return DEFAULTS.snooze_minutes
}

const VALID_CATEGORIES: readonly ActivityCategory[] = ['task', 'habit', 'event', 'note', 'reminder']
const HEX_RE = /^#[0-9a-f]{6}$/i

function normalizeCategoryOverrides(v: unknown): Partial<Record<ActivityCategory, string>> {
  if (!v || typeof v !== 'object') return {}
  const r = v as Record<string, unknown>
  const out: Partial<Record<ActivityCategory, string>> = {}
  for (const cat of VALID_CATEGORIES) {
    const val = r[cat]
    if (typeof val === 'string' && HEX_RE.test(val)) out[cat] = val
  }
  return out
}

/** Coerce a raw jsonb value (any shape) into a typed UserPreferences.
 *  Unknown keys (e.g. an older `ringtone` field from a previous version of
 *  the settings page) are silently dropped from the typed view, but the
 *  patch-and-merge in updateUserPreferences won't actively delete them
 *  from the underlying JSON. */
export function normalizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const r = raw as Record<string, unknown>
  const rt = r.reminder_type
  return {
    reminder_type:        (rt === 'notification' || rt === 'alarm') ? rt : DEFAULTS.reminder_type,
    screenlock_reminders: typeof r.screenlock_reminders === 'boolean' ? r.screenlock_reminders : DEFAULTS.screenlock_reminders,
    snooze_enabled:       typeof r.snooze_enabled       === 'boolean' ? r.snooze_enabled       : DEFAULTS.snooze_enabled,
    snooze_minutes:       normalizeSnoozeMinutes(r.snooze_minutes),
    notification_sound:   isValidSoundId(r.notification_sound) ? r.notification_sound : DEFAULTS.notification_sound,
    morning_reminder:     normalizeDailySlot(r.morning_reminder),
    evening_review:       normalizeDailySlot(r.evening_review),
    theme:                normalizeTheme(r.theme),
    first_day_of_week:    normalizeFirstDay(r.first_day_of_week),
    time_format:          normalizeTimeFormat(r.time_format),
    date_format:          normalizeDateFormat(r.date_format),
    default_activity_public: typeof r.default_activity_public === 'boolean'
      ? r.default_activity_public
      : DEFAULTS.default_activity_public,
    day_view_color_by: r.day_view_color_by === 'category' ? 'category' : DEFAULTS.day_view_color_by,
    category_color_overrides: normalizeCategoryOverrides(r.category_color_overrides),
    daily_summary_notification: typeof r.daily_summary_notification === 'boolean'
      ? r.daily_summary_notification
      : DEFAULTS.daily_summary_notification,
  }
}

/** Read the current user's preferences. Returns defaults if no user. */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single()
  if (error || !data) return { ...DEFAULTS }
  return normalizePreferences(data.preferences)
}

/**
 * Patch a subset of preferences. Reads-and-merges instead of overwriting
 * so concurrent writes from different settings sub-pages can't clobber each
 * other (jsonb || jsonb in SQL would be lossier).
 */
export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const supabase = createClient()
  const current = await getUserPreferences(userId)
  const next: UserPreferences = { ...current, ...patch }
  const { error } = await supabase
    .from('profiles')
    .update({ preferences: next })
    .eq('id', userId)
  if (error) throw error
  return next
}

/** Server-side variant: callers pass their own admin/service-role client. */
export async function getUserPreferencesAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single()
  if (error || !data) return { ...DEFAULTS }
  return normalizePreferences(data.preferences)
}
