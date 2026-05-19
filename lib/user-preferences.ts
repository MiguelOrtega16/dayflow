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

export type ReminderType   = 'notification' | 'alarm'
export type SnoozeMinutes  = 5 | 15 | 30

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
  /** Morning planning push (default 7 AM local). */
  morning_reminder:     DailySlot
  /** Evening review push (default 8 PM local). */
  evening_review:       DailySlot
}

const DEFAULTS: UserPreferences = {
  reminder_type:        'notification',
  screenlock_reminders: false,
  snooze_enabled:       true,
  snooze_minutes:       15,
  morning_reminder:     'default',
  evening_review:       'default',
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
    morning_reminder:     normalizeDailySlot(r.morning_reminder),
    evening_review:       normalizeDailySlot(r.evening_review),
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
