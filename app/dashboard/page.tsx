import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/calendar-view'
import { AdBanner } from '@/components/ads/ad-banner'
import { ProUpgradeNudge } from '@/components/paywall/pro-upgrade-nudge'
import { StarterPackPicker } from '@/components/onboarding/starter-pack-picker'
import { SetupChecklist } from '@/components/onboarding/setup-checklist'
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

  // Accepted activity invitations must also grant visibility into the
  // inviter's calendar — otherwise an invited activity from someone the
  // user hasn't mutually shared calendars with has no "visible people" chip
  // to pass the calendar view's user filter, and silently never shows up.
  const { data: acceptedInvitations } = await supabase
    .from('activity_invitations')
    .select('inviter:profiles!activity_invitations_inviter_id_fkey(*)')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')

  const seenInviterIds = new Set<string>()
  const inviters: any[] = []
  for (const row of (acceptedInvitations || []) as any[]) {
    const p = row.inviter
    if (p && !seenInviterIds.has(p.id)) {
      seenInviterIds.add(p.id)
      inviters.push(p)
    }
  }

  // Onboarding gate: show the starter-pack picker to anyone with an empty
  // calendar who hasn't already dismissed it. Catches both brand-new signups
  // and returning users who created an account but never added an activity.
  // Decided server-side so the overlay doesn't flash for users it shouldn't.
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
  const pickerDismissed   = prefs.dismissed_starter_picker === true
  const checklistDismissed = prefs.dismissed_setup_checklist === true

  let showStarterPicker = false
  let activityCount = 0
  if (profile) {
    const { count } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .limit(1)
    activityCount = count ?? 0
    if (!pickerDismissed) showStarterPicker = activityCount === 0
  }

  // web_push_subscription lives in the DB but isn't on the typed Profile —
  // read it loosely. Either source signals "this user has a working push channel."
  const webPushSub = (profile as { web_push_subscription?: unknown } | null)?.web_push_subscription
  const hasPushSubscription = !!(profile?.fcm_token || webPushSub)

  // Checklist appears AFTER the picker is resolved — either the user dismissed
  // it or it never showed (they already had activities). Keeping them mutually
  // exclusive avoids piling overlays on a brand-new user.
  const showSetupChecklist = !!profile && !checklistDismissed && !showStarterPicker

  // The upgrade nudge only competes for the top banner slot once onboarding is
  // out of the way — never pitch Pro to someone still being onboarded. The
  // engagement/age/cooldown/entitlement gating lives inside the component.
  const showProNudge = !!profile && !showSetupChecklist && !showStarterPicker

  return (
    // Flex column so the optional setup-checklist banner stacks on top of
    // the calendar instead of overlaying it. The calendar's outer container
    // already uses h-full, which resolves against this wrapper's flex-1 row.
    <div className="flex flex-col h-full min-h-0">
      {showSetupChecklist && profile && (
        <SetupChecklist
          userId={profile.id}
          hasActivities={activityCount > 0}
          hasPushSubscription={hasPushSubscription}
        />
      )}
      {showProNudge && profile && (
        <ProUpgradeNudge
          userId={profile.id}
          createdAt={profile.created_at}
          activityCount={activityCount}
        />
      )}
      <div className="flex-1 min-h-0">
        <CalendarView
          currentUser={profile}
          sharedCalendars={sharedCalendars || []}
          inviters={inviters}
        />
      </div>
      {showStarterPicker && profile && (
        <StarterPackPicker userId={profile.id} />
      )}
      <AdBanner />
    </div>
  )
}
