import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM } from '@/lib/firebase-admin'
import { localDateStr, localHour } from '@/lib/tz-utils'

function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

// Formats "14:30:00" → "2:30 PM"
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour  = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // This cron runs every hour. It sends a 7 AM digest to each user whose local time is currently 7 AM.
  // APP_TIMEZONE: fallback IANA timezone for users without a `timezone` column in profiles
  // (e.g. "America/Bogota"). Per-user support requires a `timezone` column in the profiles table.
  const appTz = process.env.APP_TIMEZONE ?? 'UTC'
  const now   = new Date()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch all users with FCM tokens (+ timezone if the column exists)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token, timezone')
    .not('fcm_token', 'is', null)

  if (!profiles?.length) return NextResponse.json({ sent: 0 })

  // Keep only users for whom it is currently 7 AM local time
  const eligibleUsers = profiles.filter(p => {
    const tz = (p as any).timezone || appTz
    return localHour(now, tz) === 7
  })

  if (eligibleUsers.length === 0) return NextResponse.json({ sent: 0, reason: 'not 7am for any user' })

  const eligibleIds = eligibleUsers.map(p => p.id)

  // For each eligible user, query their timed activities for their local today
  // Group by timezone so we only compute the local date once per unique tz
  const dateByTz = new Map<string, string>()
  const userTzMap = new Map<string, string>()
  for (const p of eligibleUsers) {
    const tz = (p as any).timezone || appTz
    userTzMap.set(p.id, tz)
    if (!dateByTz.has(tz)) dateByTz.set(tz, localDateStr(now, tz))
  }

  // Fetch activities owned by eligible users today
  const localDates = Array.from(new Set(dateByTz.values()))
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, user_id, start_time, date')
    .in('user_id', eligibleIds)
    .in('date', localDates)
    .not('start_time', 'is', null)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[activity-reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also include activities where the user is an accepted invitee
  const allActivityIds = (activities ?? []).map(a => a.id)
  const { data: invitedActivities } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id, activities(id, title, emoji, user_id, start_time, date)')
    .in('invitee_id', eligibleIds)
    .eq('status', 'accepted')

  // Build per-user activity list: owned + invited
  const byUser: Record<string, Array<{ id: string; title: string; emoji: string | null; start_time: string; date: string }>> = {}
  for (const uid of eligibleIds) byUser[uid] = []

  for (const act of activities ?? []) {
    byUser[act.user_id]?.push(act)
  }
  for (const inv of invitedActivities ?? []) {
    const act = (inv as any).activities
    const uid = inv.invitee_id
    if (act && byUser[uid]) {
      const userDate = dateByTz.get(userTzMap.get(uid)!)
      if (act.date === userDate && act.start_time) byUser[uid].push(act)
    }
  }

  const tokenMap: Record<string, string> = {}
  for (const p of eligibleUsers) {
    if (p.fcm_token) tokenMap[p.id] = p.fcm_token
  }

  let sent = 0
  await Promise.all(
    eligibleIds.map(async uid => {
      const token = tokenMap[uid]
      if (!token) return

      const acts = byUser[uid]
        .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i) // dedupe invited+owned
        .sort((a, b) => a.start_time.localeCompare(b.start_time))

      const todayStr = dateByTz.get(userTzMap.get(uid)!)!
      const count = acts.length

      if (count === 0) {
        // No timed activities — send a lighter nudge
        await sendFCM(
          token,
          '☀️ Buenos días',
          'No tienes actividades programadas para hoy.',
          { type: 'activity_reminder', date: todayStr },
        )
      } else {
        const title = `📅 Tienes ${count} actividad${count > 1 ? 'es' : ''} hoy`
        const lines = acts.slice(0, 4).map(a => {
          const label = a.emoji ? `${a.emoji} ${a.title}` : a.title
          return `${formatTime(a.start_time)} — ${label}`
        })
        if (count > 4) lines.push(`…y ${count - 4} más`)
        await sendFCM(token, title, lines.join('\n'), { type: 'activity_reminder', date: todayStr })
      }

      sent++
    }),
  )

  return NextResponse.json({ sent, eligible: eligibleUsers.length })
}
