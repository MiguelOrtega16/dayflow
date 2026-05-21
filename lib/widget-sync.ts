import { format, addDays, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { WidgetBridge, isWidgetSupported } from '@/lib/widget-bridge'
import { computeEntitlement } from '@/lib/billing/entitlement'
import type { Subscription } from '@/types'

/**
 * Push the current widget data into native SharedPreferences.
 *
 * Self-contained: queries Supabase directly for the date window the widgets
 * need (today − 60 days for streak math, today → today + 30 for the
 * activity list + NextUp). This way the snapshot doesn't go stale just
 * because the calendar view is currently looking at a different month —
 * a problem we hit with the previous "pass me whatever activities you
 * happen to have in memory" signature.
 *
 * Payload shape (all consumed by Kotlin via WidgetStore):
 *   {
 *     activities: [...],   // today + 30 days forward
 *     stats:      {
 *       streak_days: number,
 *       today_done: number,
 *       today_total: number,
 *     },
 *     next: {              // soonest upcoming activity
 *       id, title, emoji, date, start_time
 *     } | null,
 *   }
 */
export async function syncWidgetSnapshot(currentUserId: string) {
  if (!isWidgetSupported()) return
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const untilStr = format(addDays(new Date(), 30), 'yyyy-MM-dd')
  const sinceStr = format(subDays(new Date(), 60), 'yyyy-MM-dd')

  const supabase = createClient()
  // Run the activities query alongside the entitlement check — both are
  // needed, and parallelizing them keeps the snapshot fast. The Pro-only
  // streak / NextUp widgets get their data zeroed when isPro is false so
  // the native widget surface visibly stops updating after downgrade,
  // matching the soft-revert applied elsewhere in-app. The free Today
  // widget keeps full data either way.
  const [activitiesRes, subsRes] = await Promise.all([
    supabase
      .from('activities')
      .select('id, title, emoji, date, start_time, status, user_id')
      .eq('user_id', currentUserId)
      .gte('date', sinceStr)
      .lte('date', untilStr),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', currentUserId),
  ])

  if (activitiesRes.error) {
    console.warn('[widget-sync] fetch failed:', activitiesRes.error)
    return
  }
  const rows = activitiesRes.data ?? []
  const isPro = computeEntitlement((subsRes.data ?? []) as Subscription[]).isPro

  // ── Today + 30 days forward for the Today widget list ────────────────────
  const slim = rows
    .filter(a => a.date >= todayStr)
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
  // Today's items whose start_time has already passed are excluded.
  const now = new Date()
  const next = rows
    .filter(a => a.status !== 'done' && a.start_time && a.date >= todayStr)
    .filter(a => {
      if (a.date !== todayStr) return true
      const [h, m] = (a.start_time as string).split(':').map(Number)
      const at = new Date()
      at.setHours(h, m, 0, 0)
      return at.getTime() > now.getTime()
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (a.start_time || '').localeCompare(b.start_time || '')
    })[0]

  // NextUp is a Pro widget — withhold the payload when the user isn't Pro
  // so the home-screen widget visibly stops updating on downgrade (the
  // native renderer treats null as "no upcoming activity").
  const nextPayload = isPro && next ? {
    id:         next.id,
    title:      next.title,
    emoji:      next.emoji,
    date:       next.date,
    start_time: next.start_time,
  } : null

  // ── Stats (streak + today completion) ────────────────────────────────────
  const doneByDate = new Set(rows.filter(a => a.status === 'done').map(a => a.date))
  let streak = 0
  let walking = new Date()
  if (!doneByDate.has(format(walking, 'yyyy-MM-dd'))) walking = subDays(walking, 1)
  while (streak <= 365 && doneByDate.has(format(walking, 'yyyy-MM-dd'))) {
    streak++
    walking = subDays(walking, 1)
  }
  const todayItems = rows.filter(a => a.date === todayStr)
  // streak_days powers the Pro Streak widget — zero it out for free users
  // so the widget doesn't keep boasting a streak after the subscription
  // ended. today_done / today_total stay populated for the free Today
  // widget regardless of tier.
  const stats = {
    streak_days: isPro ? streak : 0,
    today_done:  todayItems.filter(a => a.status === 'done').length,
    today_total: todayItems.length,
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

export function startWidgetAuthSync(): () => void {
  if (!isWidgetSupported()) return () => {}
  syncWidgetAuth()
  const supabase = createClient()
  const { data: sub } = supabase.auth.onAuthStateChange(() => { syncWidgetAuth() })
  return () => sub.subscription.unsubscribe()
}
