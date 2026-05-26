/**
 * Discovery dots: first-run red-dot badges that draw new users toward the
 * Menu, People, and Settings entry points. Each dot is independent and
 * persists its dismissed state in profile.preferences (jsonb).
 *
 * Eligibility is gated by profile.created_at: only accounts created on or
 * after DISCOVERY_DOTS_RELEASE_DATE see dots. This means existing users
 * never get them when the feature ships — no signup-time write required,
 * and no migration backfill.
 */

import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

/** Cutoff timestamp: any profile created strictly before this is treated as
 *  a pre-existing user and never sees discovery dots. Set to the deploy
 *  date so all new signups going forward are eligible. */
export const DISCOVERY_DOTS_RELEASE_DATE = '2026-05-26T00:00:00Z'

export type DiscoveryKey = 'menu' | 'people' | 'settings'

const PREF_KEY: Record<DiscoveryKey, string> = {
  menu:     'dismissed_discovery_menu',
  people:   'dismissed_discovery_people',
  settings: 'dismissed_discovery_settings',
}

export interface DiscoveryDots {
  menu:     boolean
  people:   boolean
  settings: boolean
}

const NONE: DiscoveryDots = { menu: false, people: false, settings: false }

/** Pure: which dots should currently show for this profile. */
export function getDiscoveryDots(profile: Profile | null): DiscoveryDots {
  if (!profile?.created_at) return NONE
  if (profile.created_at < DISCOVERY_DOTS_RELEASE_DATE) return NONE
  const prefs = (profile.preferences as Record<string, unknown> | null) ?? {}
  return {
    menu:     prefs[PREF_KEY.menu]     !== true,
    people:   prefs[PREF_KEY.people]   !== true,
    settings: prefs[PREF_KEY.settings] !== true,
  }
}

/**
 * Persist that the user has interacted with the surface a dot was promoting.
 * Optimistic: patches the in-memory profile cache first so the dot vanishes
 * immediately, then writes to Supabase. On write failure the dot reappears
 * on next load — harmless.
 */
export async function markDiscoverySeen(
  profile: Profile | null,
  setProfile: (next: Profile | null) => void,
  key: DiscoveryKey,
): Promise<void> {
  if (!profile) return
  const prefs = (profile.preferences as Record<string, unknown> | null) ?? {}
  if (prefs[PREF_KEY[key]] === true) return

  const nextPrefs = {
    ...prefs,
    [PREF_KEY[key]]: true,
    [`${PREF_KEY[key]}_at`]: new Date().toISOString(),
  }
  setProfile({ ...profile, preferences: nextPrefs })

  try {
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ preferences: nextPrefs })
      .eq('id', profile.id)
  } catch (err) {
    console.warn('[discovery-dots] dismiss write failed', err)
  }
}
