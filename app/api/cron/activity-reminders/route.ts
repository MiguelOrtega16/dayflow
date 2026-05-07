import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM } from '@/lib/firebase-admin'

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // All timed activities for today (cron runs once a day — morning digest)
  const todayStr = new Date().toISOString().slice(0, 10)

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, user_id, start_time')
    .eq('date', todayStr)
    .not('start_time', 'is', null)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Collect all recipients per activity: owner + accepted invitees
  const activityIds = activities.map(a => a.id)

  const { data: invitations } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id')
    .in('activity_id', activityIds)
    .eq('status', 'accepted')

  const recipientMap: Record<string, string[]> = {}
  for (const act of activities) recipientMap[act.id] = [act.user_id]
  for (const inv of invitations ?? []) recipientMap[inv.activity_id]?.push(inv.invitee_id)

  // Group activities by recipient so each user gets one summary notification
  const byUser: Record<string, typeof activities> = {}
  for (const act of activities) {
    for (const uid of recipientMap[act.id] ?? []) {
      if (!byUser[uid]) byUser[uid] = []
      byUser[uid].push(act)
    }
  }

  // Fetch FCM tokens
  const allUserIds = Object.keys(byUser)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token')
    .in('id', allUserIds)
    .not('fcm_token', 'is', null)

  const tokenMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    if (p.fcm_token) tokenMap[p.id] = p.fcm_token
  }

  // Send one summary push per user
  let sent = 0
  await Promise.all(
    Object.entries(byUser).map(async ([uid, acts]) => {
      const token = tokenMap[uid]
      if (!token) return

      const count = acts.length
      const title = `📅 Tienes ${count} actividad${count > 1 ? 'es' : ''} hoy`
      const lines = acts.slice(0, 4).map(a => {
        const label = a.emoji ? `${a.emoji} ${a.title}` : a.title
        return `${formatTime(a.start_time!)} — ${label}`
      })
      if (count > 4) lines.push(`…y ${count - 4} más`)
      const body = lines.join('\n')

      await sendFCM(token, title, body, { type: 'activity_reminder', date: todayStr })
      sent++
    })
  )

  return NextResponse.json({ sent, activities: activities.length })
}
