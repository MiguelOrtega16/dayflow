import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM } from '@/lib/firebase-admin'

// Vercel invokes this with Authorization: Bearer CRON_SECRET
function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Use service-role key to bypass RLS and read all users' activities
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find activities starting in 25–35 minutes from now
  const now       = new Date()
  const windowMin = new Date(now.getTime() + 25 * 60 * 1000)
  const windowMax = new Date(now.getTime() + 35 * 60 * 1000)

  const todayStr    = now.toISOString().slice(0, 10)
  const windowMinT  = windowMin.toTimeString().slice(0, 5)   // "HH:MM"
  const windowMaxT  = windowMax.toTimeString().slice(0, 5)

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, user_id, start_time, date')
    .eq('date', todayStr)
    .gte('start_time', windowMinT)
    .lte('start_time', windowMaxT)

  if (error) {
    console.error('[reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // For each activity, collect all recipients: owner + accepted invitees
  const activityIds = activities.map(a => a.id)

  const { data: invitations } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id')
    .in('activity_id', activityIds)
    .eq('status', 'accepted')

  // Build map: activityId → [userId, ...inviteeIds]
  const recipientMap: Record<string, string[]> = {}
  for (const act of activities) {
    recipientMap[act.id] = [act.user_id]
  }
  for (const inv of invitations ?? []) {
    recipientMap[inv.activity_id]?.push(inv.invitee_id)
  }

  // Fetch all relevant FCM tokens in one query
  const allUserIds = [...new Set(Object.values(recipientMap).flat())]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token')
    .in('id', allUserIds)
    .not('fcm_token', 'is', null)

  const tokenMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    if (p.fcm_token) tokenMap[p.id] = p.fcm_token
  }

  // Send push notifications
  let sent = 0
  for (const act of activities) {
    const label  = act.emoji ? `${act.emoji} ${act.title}` : act.title
    const title  = '⏰ Próxima actividad'
    const body   = `"${label}" empieza en 30 minutos`
    const recipients = recipientMap[act.id] ?? []

    await Promise.all(
      recipients
        .filter(uid => tokenMap[uid])
        .map(uid => sendFCM(tokenMap[uid], title, body).then(() => { sent++ }))
    )
  }

  return NextResponse.json({ sent, activities: activities.length })
}
