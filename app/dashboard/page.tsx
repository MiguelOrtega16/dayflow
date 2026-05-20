import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/calendar-view'
import { StarterPackPicker } from '@/components/onboarding/starter-pack-picker'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Fetch profile; auto-create it if the signup trigger didn't run
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const { data: created } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        color: '#6366f1',
      })
      .select('*')
      .single()
    profile = created
  }

  // Only accepted calendar shares feed the calendar view
  const { data: sharedCalendars } = await supabase
    .from('shared_calendars')
    .select(`
      *,
      owner:profiles!shared_calendars_owner_id_fkey(*),
      shared_with:profiles!shared_calendars_shared_with_id_fkey(*)
    `)
    .or(`owner_id.eq.${user.id},shared_with_id.eq.${user.id}`)
    .eq('status', 'accepted')

  // Onboarding gate: show the starter-pack picker to anyone with an empty
  // calendar who hasn't already dismissed it. Catches both brand-new signups
  // and returning users who created an account but never added an activity.
  // Decided server-side so the overlay doesn't flash for users it shouldn't.
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
  const alreadyDismissed = prefs.dismissed_starter_picker === true
  let showStarterPicker = false
  if (profile && !alreadyDismissed) {
    const { count } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .limit(1)
    showStarterPicker = (count ?? 0) === 0
  }

  return (
    <>
      <CalendarView
        currentUser={profile}
        sharedCalendars={sharedCalendars || []}
      />
      {showStarterPicker && profile && (
        <StarterPackPicker userId={profile.id} />
      )}
    </>
  )
}
