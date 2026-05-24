'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

/**
 * Shared profile state for the dashboard. Hydrated server-side in
 * app/dashboard/layout.tsx and exposed here so settings sub-pages can
 * read the profile they were already shown moments ago — without
 * re-fetching on every mount and flashing a blank form on back-nav.
 *
 * Edits that change identity fields (name, color, preferences) should
 * call `setProfile` after a successful write so the cache stays in
 * lockstep with the database. `refresh` is the escape hatch for
 * out-of-band changes (RevenueCat webhook, etc.).
 */

interface ProfileContextValue {
  profile: Profile | null
  setProfile: (next: Profile | null) => void
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({
  initialProfile,
  children,
}: {
  initialProfile: Profile | null
  children: React.ReactNode
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile)

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (data) setProfile(data as Profile)
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, setProfile, refresh }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfile must be used inside <ProfileProvider>')
  }
  return ctx
}
