import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM } from '@/lib/firebase-admin'
import { localToUTC, localDateStr } from '@/lib/tz-utils'

function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // APP_TIMEZONE: IANA timezone in which start_time values are stored (e.g. "America/Bogota").
  // For per-user timezones, store a `timezone` column in profiles and use that instead.
  const appTz = process.env.APP_TIMEZONE ?? 'UTC'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()

  // Query the local date + the next one to handle the window spanning midnight
  const todayLocal  = localDateStr(now, appTz)
  const tomorrowLocal = localDateStr(new Date(now.getTime() + 32 * 60_000), appTz)
  const dates = todayLocal === tomorrowLocal ? [todayLocal] : [todayLocal, tomorrowLocal]

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, user_id, start_time, date')
    .in('date', dates)
    .not('start_time', 'is', null)

  if (error) {
    console.error('[activity-30min-reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Filter to activities starting in 28–32 minutes, interpreting start_time in appTz
  const candidateActivities = activities.map(act => {
    const timeStr = act.start_time!.slice(0, 5) // "HH:MM"
    const actUtc  = localToUTC(act.date, timeStr, appTz)
    const minutesBefore = Math.round((actUtc.getTime() - now.getTime()) / 60_000)
    return { ...act, minutesBefore }
  }).filter(a => a.minutesBefore >= 28 && a.minutesBefore <= 32)

  if (candidateActivities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Collect all recipients per activity: owner + accepted invitees
  const activityIds = candidateActivities.map(a => a.id)

  const { data: invitations } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id')
    .in('activity_id', activityIds)
    .eq('status', 'accepted')

  const recipientMap: Record<string, string[]> = {}
  for (const act of candidateActivities) recipientMap[act.id] = [act.user_id]
  for (const inv of invitations ?? []) recipientMap[inv.activity_id]?.push(inv.invitee_id)

  // Fetch FCM tokens
  const allRecipients = new Set<string>()
  for (const recipients of Object.values(recipientMap)) recipients.forEach(r => allRecipients.add(r))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token')
    .in('id', Array.from(allRecipients))
    .not('fcm_token', 'is', null)

  const tokenMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    if (p.fcm_token) tokenMap[p.id] = p.fcm_token
  }

  let sent = 0
  await Promise.all(
    candidateActivities.map(async act => {
      const recipients = recipientMap[act.id] ?? []
      const label = act.emoji ? `${act.emoji} ${act.title}` : act.title
      const mins  = act.minutesBefore

      await Promise.all(
        recipients.map(async uid => {
          const token = tokenMap[uid]
          if (!token) return
          await sendFCM(
            token,
            `⏰ En ${mins} minutos: ${label}`,
            'Tu siguiente actividad se acerca. ¡Tú puedes! 💪',
            { type: 'activity_30min_reminder', date: act.date, activityId: act.id },
          )
          sent++
        }),
      )
    }),
  )

  return NextResponse.json({ sent, checked: candidateActivities.length })
}
