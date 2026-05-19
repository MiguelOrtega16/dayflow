import { format, addDays, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { WidgetBridge, isWidgetSupported } from '@/lib/widget-bridge'
import type { Activity } from '@/types'

/**
 * Push the current set of activities the widget should display into native
 * SharedPreferences. Called after every fetch in calendar-view.tsx — cheap
 * no-op on web/iOS.
 *
 * Payload shape (all consumed by Kotlin via WidgetStore):
 *   {
 *     activities: [...],   // today + 30 days forward (Today widget)
 *     stats:      {        // computed from past 60 days (Streak widget)
 *       streak_days: number,
 *       today_done: number,
 *       today_total: number,
 *     },
 *     next: {              // soonest upcoming activity (NextUp widget)
 *       id, title, emoji, date, start_time
 *     } | null,
 *   }
 */
export async function syncWidgetSnapshot(activities: Activity[], currentUserId: string) {
  if (!isWidgetSupported()) return
  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const own = activities.filter(a => a.user_id === currentUserId)

  const slim = own
    .filter(a => a.date >= today && a.date <= until)
    .map(a => ({
      id:         a.id,
      title:      a.title,
      emoji:      a.emoji,
      date:       a.date,
      start_time: a.start_time,
      status:     a.status,
    }))

  // ── Next-upcoming activity ────────────────────────────────────────────────
  // Earliest pending activity from today onward that has a start_time.
  // Within the same day we sort by start_time; across days the date sort wins.
  const now = new Date()
  const next = own
    .filter(a => a.status !== 'done' && a.start_time && a.date >= today)
    .filter(a => {
      // Exclude today's items whose start_time has already passed
      if (a.date !== today) return true
      const [h, m] = (a.start_time as string).split(':').map(Number)
      const at = new Date()
      at.setHours(h, m, 0, 0)
      return at.getTime() > now.getTime()
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (a.start_time || '').localeCompare(b.start_time || '')
    })[0]

  const nextPayload = next ? {
    id:         next.id,
    title:      next.title,
    emoji:      next.emoji,
    date:       next.date,
    start_time: next.start_time,
  } : null

  // ── Stats (streak + today completion) ─────────────────────────────────────
  // Requires past activities, which the in-memory list may not include. Fetch
  // a 60-day window directly. Failures here shouldn't block the snapshot.
  let stats = { streak_days: 0, today_done: 0, today_total: 0 }
  try {
    const since = format(subDays(new Date(), 60), 'yyyy-MM-dd')
    const supabase = createClient()
    const { data } = await supabase
      .from('activities')
      .select('date, status')
      .eq('user_id', currentUserId)
      .gte('date', since)

    const past = data ?? []
    const doneByDate = new Set(past.filter(a => a.status === 'done').map(a => a.date))

    // Streak: consecutive days back from today with at least one done.
    // Today is allowed to be empty (you haven't finished anything yet today)
    // — in that case we look back starting at yesterday.
    let streak = 0
    let walking = new Date()
    if (!doneByDate.has(format(walking, 'yyyy-MM-dd'))) walking = subDays(walking, 1)
    while (streak <= 365 && doneByDate.has(format(walking, 'yyyy-MM-dd'))) {
      streak++
      walking = subDays(walking, 1)
    }

    const todayItems = past.filter(a => a.date === today)
    stats = {
      streak_days: streak,
      today_done:  todayItems.filter(a => a.status === 'done').length,
      today_total: todayItems.length,
    }
  } catch (e) {
    console.warn('[widget-sync] stats fetch failed:', e)
  }

  await WidgetBridge.writeSnapshot(JSON.stringify({
    activities: slim,
    stats,
    next: nextPayload,
  }))
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
