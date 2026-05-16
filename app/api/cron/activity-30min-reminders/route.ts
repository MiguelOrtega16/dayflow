import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM, sendWebPush } from '@/lib/firebase-admin'
import { localToUTC, localDateStr } from '@/lib/tz-utils'

const MOTIVATIONAL = [
  '¡Tú puedes! 💪',
  '¡Vas genial! 🚀',
  '¡Sigue adelante! ⭐',
  '¡A por ello! 🎯',
  '¡Hoy es tu día! ☀️',
  '¡Cada paso cuenta! 🌟',
  '¡Tu esfuerzo vale la pena! 💫',
  '¡No te rindas! 🔥',
  '¡Un paso más hacia tu meta! 🏆',
  '¡Estás haciendo un gran trabajo! 👏',
]
const randomMotivation = () => MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]

function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const appTz = process.env.APP_TIMEZONE ?? 'UTC'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()

  // ── Auto-mark past reminders as done ────────────────────────────────────────
  // Reminders are point-in-time; once their time has passed they should be done.
  const todayLocalForCleanup = localDateStr(now, appTz)
  const { data: pendingReminders } = await supabase
    .from('activities')
    .select('id, date, start_time')
    .eq('category', 'reminder')
    .eq('status', 'todo')
    .not('start_time', 'is', null)
    .lte('date', todayLocalForCleanup)

  if (pendingReminders && pendingReminders.length > 0) {
    const pastIds = pendingReminders
      .filter(r => {
        const utc = localToUTC(r.date, r.start_time!.slice(0, 5), appTz)
        return utc.getTime() < now.getTime()
      })
      .map(r => r.id)

    if (pastIds.length > 0) {
      await supabase
        .from('activities')
        .update({ status: 'done', completion_percentage: 100 })
        .in('id', pastIds)
    }
  }

  // Query today + tomorrow to handle windows that span midnight
  const todayLocal    = localDateStr(now, appTz)
  const tomorrowLocal = localDateStr(new Date(now.getTime() + 32 * 60_000), appTz)
  const dates         = todayLocal === tomorrowLocal ? [todayLocal] : [todayLocal, tomorrowLocal]

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, description, user_id, start_time, date, category')
    .in('date', dates)
    .not('start_time', 'is', null)

  if (error) {
    console.error('[activity-30min-reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Split into reminders (fire AT exact time) and activities (fire 30 min before)
  const withTiming = activities.map(act => {
    const timeStr = act.start_time!.slice(0, 5)
    const actUtc  = localToUTC(act.date, timeStr, appTz)
    const minutesBefore = Math.round((actUtc.getTime() - now.getTime()) / 60_000)
    return { ...act, minutesBefore }
  })

  const reminderCandidates  = withTiming.filter(a => a.category === 'reminder' && a.minutesBefore >= -2 && a.minutesBefore <= 2)
  const activityCandidates  = withTiming.filter(a => a.category !== 'reminder' && a.minutesBefore >= 28 && a.minutesBefore <= 32)
  const allCandidates       = [...reminderCandidates, ...activityCandidates]

  if (allCandidates.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Collect recipients (owner + accepted invitees)
  const allIds = allCandidates.map(a => a.id)

  const { data: invitations } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id')
    .in('activity_id', allIds)
    .eq('status', 'accepted')

  const recipientMap: Record<string, string[]> = {}
  for (const act of allCandidates) recipientMap[act.id] = [act.user_id]
  for (const inv of invitations ?? []) recipientMap[inv.activity_id]?.push(inv.invitee_id)

  const allRecipients = new Set<string>()
  for (const r of Object.values(recipientMap)) r.forEach(uid => allRecipients.add(uid))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token, web_push_subscription')
    .in('id', Array.from(allRecipients))

  const tokenMap: Record<string, string> = {}
  const webPushMap: Record<string, any>  = {}
  for (const p of profiles ?? []) {
    if (p.fcm_token)              tokenMap[p.id]    = p.fcm_token
    if (p.web_push_subscription)  webPushMap[p.id]  = p.web_push_subscription
  }

  let sent = 0

  await Promise.all(allCandidates.map(async act => {
    const recipients = recipientMap[act.id] ?? []
    const isReminder = act.category === 'reminder'
    const label      = act.emoji ? `${act.emoji} ${act.title}` : act.title

    await Promise.all(recipients.map(async uid => {
      const token = tokenMap[uid]

      const webSub = webPushMap[uid]
      if (isReminder) {
        const title = `🔔 ${act.title}`
        const body  = randomMotivation()
        const data  = { type: 'activity_reminder', date: act.date, activityId: act.id }
        if (token)  { await sendFCM(token, title, body, data); sent++ }
        if (webSub) { await sendWebPush(webSub, title, body, data); if (!token) sent++ }
        // In-app notification so the bell lights up
        await supabase.from('notifications').insert({
          recipient_id: uid, actor_id: uid,
          type: 'activity_reminder', activity_id: act.id,
          message: `🔔 Recordatorio: ${act.title}`,
        })
      } else {
        const title = `⏰ En ${act.minutesBefore} minutos: ${label}`
        const body  = randomMotivation()
        const data  = { type: 'activity_30min_reminder', date: act.date, activityId: act.id }
        if (token)  { await sendFCM(token, title, body, data); sent++ }
        if (webSub) { await sendWebPush(webSub, title, body, data); if (!token) sent++ }
      }
    }))
  }))

  return NextResponse.json({
    sent,
    reminders: reminderCandidates.length,
    activities: activityCandidates.length,
  })
}
