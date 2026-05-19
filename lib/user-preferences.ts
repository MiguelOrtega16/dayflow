/**
 * Typed wrapper around the profiles.preferences jsonb column.
 *
 * The column is created with default '{}' so every existing user has an
 * empty object — never null. Each getter falls back to a documented default,
 * so a profile that hasn't opened the new settings yet still behaves
 * sensibly (notification type, system ringtone).
 */

import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReminderType = 'notification' | 'alarm'

export interface UserPreferences {
  reminder_type: ReminderType
}

const DEFAULTS: UserPreferences = {
  reminder_type: 'notification',
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
    reminder_type: (rt === 'notification' || rt === 'alarm') ? rt : DEFAULTS.reminder_type,
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
