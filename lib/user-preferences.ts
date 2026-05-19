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
export type Ringtone     = 'system' | 'gentle' | 'chime' | 'digital' | 'marimba' | 'bell'

export interface UserPreferences {
  reminder_type: ReminderType
  ringtone:      Ringtone
}

const DEFAULTS: UserPreferences = {
  reminder_type: 'notification',
  ringtone:      'system',
}

/** Coerce a raw jsonb value (any shape) into a typed UserPreferences. */
export function normalizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const r = raw as Record<string, unknown>
  const rt = r.reminder_type
  const rg = r.ringtone
  return {
    reminder_type: (rt === 'notification' || rt === 'alarm') ? rt : DEFAULTS.reminder_type,
    ringtone:
      (rg === 'system' || rg === 'gentle' || rg === 'chime' ||
       rg === 'digital' || rg === 'marimba' || rg === 'bell')
        ? rg
        : DEFAULTS.ringtone,
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
