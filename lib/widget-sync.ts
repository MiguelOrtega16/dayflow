import { format, addDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { WidgetBridge, isWidgetSupported } from '@/lib/widget-bridge'
import type { Activity } from '@/types'

/**
 * Push the current set of activities the widget should display into native
 * SharedPreferences. Called after every fetch in calendar-view.tsx — cheap
 * no-op on web/iOS.
 *
 * We slim the payload to just what the widget renders to keep prefs tiny.
 */
export async function syncWidgetSnapshot(activities: Activity[], currentUserId: string) {
  if (!isWidgetSupported()) return
  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const slim = activities
    .filter(a => a.user_id === currentUserId)
    .filter(a => a.date >= today && a.date <= until)
    .map(a => ({
      id:         a.id,
      title:      a.title,
      emoji:      a.emoji,
      date:       a.date,
      start_time: a.start_time,
      status:     a.status,
    }))

  await WidgetBridge.writeSnapshot(JSON.stringify({ activities: slim }))
}

/**
 * Mirror the current Supabase session into native storage so the widget can
 * call REST directly (refresh + toggle-done) without going through the app.
 *
 * Call once on dashboard mount and whenever the auth state changes.
 */
export async function syncWidgetAuth() {
  if (!isWidgetSupported()) return
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    await WidgetBridge.clearAuth()
    return
  }
  await WidgetBridge.writeAuth({
    supabaseUrl:  process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey:      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken:  session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:    session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId:       session.user.id,
  })
}

/**
 * One-shot setup: sync auth now and subscribe to future auth-state changes
 * so the widget always has a fresh token cached. Returns an unsubscribe fn.
 */
export function startWidgetAuthSync(): () => void {
  if (!isWidgetSupported()) return () => {}
  syncWidgetAuth()
  const supabase = createClient()
  const { data: sub } = supabase.auth.onAuthStateChange(() => { syncWidgetAuth() })
  return () => sub.subscription.unsubscribe()
}
