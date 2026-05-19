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

// How wide the firing window is around each scheduled offset. Must be larger
// than the cron interval to avoid missing fires, but not so wide that a single
// offset fires twice within consecutive cron runs.
const FIRE_WINDOW_MIN = 2

// Default offsets when activity.reminder_offsets is null/empty — preserves the
// legacy behavior: reminders fire AT start_time, other activities 30 min before.
function defaultOffsets(category: string): number[] {
  return category === 'reminder' ? [0] : [30]
}

// Format a minute count as a short Spanish phrase for the push title.
function formatOffsetEs(min: number): string {
  if (min === 0) return 'ahora'
  if (min < 60) return `en ${min} min`
  if (min < 1440) {
    const h = Math.round(min / 60)
    return `en ${h} h`
  }
  const d = Math.round(min / 1440)
  return d === 1 ? 'en 1 día' : `en ${d} días`
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

  // ── Multi-offset reminder dispatch ──────────────────────────────────────────
  // Look up to 7 days ahead so a 1-week-before offset can still fire. The
  // schema check constraint caps offsets at 10080 min (7 days) so this is the
  // maximum lookahead we'd ever need.
  const dates: string[] = []
  for (let i = 0; i <= 7; i++) {
    const d = localDateStr(new Date(now.getTime() + i * 86_400_000), appTz)
    if (!dates.includes(d)) dates.push(d)
  }

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, user_id, start_time, date, category, reminder_offsets')
    .in('date', dates)
    .not('start_time', 'is', null)

  if (error) {
    console.error('[activity-30min-reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Collect every (activity, offset) pair whose fire-time falls in the current
  // FIRE_WINDOW. A single activity may produce multiple fires across cron runs
  // (one per offset, one per cron tick that lands in the window).
  interface Fire {
    activityId: string
    title: string
    emoji: string | null
    userId: string
    category: string
    date: string
    offset: number
    minutesUntilStart: number
  }
  const fires: Fire[] = []

  for (const act of activities) {
    const offsets: number[] = act.reminder_offsets && act.reminder_offsets.length > 0
      ? act.reminder_offsets
      : defaultOffsets(act.category)

    const timeStr = act.start_time!.slice(0, 5)
    const actUtc  = localToUTC(act.date, timeStr, appTz)
    const minutesUntilStart = Math.round((actUtc.getTime() - now.getTime()) / 60_000)

    for (const offset of offsets) {
      const delta = minutesUntilStart - offset
      if (delta >= -FIRE_WINDOW_MIN && delta <= FIRE_WINDOW_MIN) {
        fires.push({
          activityId: act.id,
          title: act.title,
          emoji: act.emoji,
          userId: act.user_id,
          category: act.category,
          date: act.date,
          offset,
          minutesUntilStart,
        })
      }
    }
  }

  if (fires.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Collect recipients (owner + accepted invitees) for the activities we'll fire.
  const firingActivityIds = Array.from(new Set(fires.map(f => f.activityId)))
  const { data: invitations } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id')
    .in('activity_id', firingActivityIds)
    .eq('status', 'accepted')

  const inviteesByActivity: Record<string, string[]> = {}
  for (const inv of invitations ?? []) {
    if (!inviteesByActivity[inv.activity_id]) inviteesByActivity[inv.activity_id] = []
    inviteesByActivity[inv.activity_id].push(inv.invitee_id)
  }

  const allRecipients = new Set<string>()
  for (const f of fires) {
    allRecipients.add(f.userId)
    for (const id of inviteesByActivity[f.activityId] ?? []) allRecipients.add(id)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token, web_push_subscription, preferences')
    .in('id', Array.from(allRecipients))

  type WebPushSub = { endpoint: string; keys: { p256dh: string; auth: string } }
  const tokenMap: Record<string, string> = {}
  const webPushMap: Record<string, WebPushSub> = {}
  // Per-user FCM routing pulled from the preferences jsonb. Defaults match
  // the new-user state in lib/user-preferences.ts.
  const reminderTypeMap: Record<string, 'notification' | 'alarm'> = {}
  const screenlockMap:   Record<string, boolean> = {}
  for (const p of profiles ?? []) {
    if (p.fcm_token)             tokenMap[p.id]   = p.fcm_token
    if (p.web_push_subscription) webPushMap[p.id] = p.web_push_subscription as WebPushSub
    const prefs = (p.preferences ?? {}) as Record<string, unknown>
    reminderTypeMap[p.id] = prefs.reminder_type === 'alarm' ? 'alarm' : 'notification'
    screenlockMap[p.id]   = prefs.screenlock_reminders === true
  }

  let sent = 0

  await Promise.all(fires.map(async fire => {
    const label  = fire.emoji ? `${fire.emoji} ${fire.title}` : fire.title
    const recipients = [fire.userId, ...(inviteesByActivity[fire.activityId] ?? [])]
    const isReminderCategory = fire.category === 'reminder'

    // Title style differs by whether the activity is itself a "reminder" (bell)
    // or a regular activity (clock). offset=0 collapses the "in N min" text to
    // a more natural phrasing.
    let pushTitle: string
    if (fire.offset === 0) {
      pushTitle = isReminderCategory ? `🔔 ${fire.title}` : `⏰ ${label}`
    } else {
      pushTitle = `${isReminderCategory ? '🔔' : '⏰'} ${formatOffsetEs(fire.offset)}: ${label}`
    }
    const body = randomMotivation()
    const data = {
      type: isReminderCategory ? 'activity_reminder' : 'activity_30min_reminder',
      date: fire.date,
      activityId: fire.activityId,
      offsetMinutes: String(fire.offset),
    }

    await Promise.all(recipients.map(async uid => {
      const token  = tokenMap[uid]
      const webSub = webPushMap[uid]
      // Route alarm-type reminders through the high-importance Android
      // channel ('activity-alarms') which the native side declares with
      // IMPORTANCE_HIGH + insistent vibration. Web push has no channels.
      const isAlarm = reminderTypeMap[uid] === 'alarm'
      // Lock-screen visibility: 'public' shows full title+body on the lock
      // screen, 'private' hides content until unlock. The Android default
      // varies by channel; we set it explicitly per push so the user's
      // preference always wins.
      // For alarm-type, we also opt into the pre-Android-8 alarm payload
      // (notificationPriority/defaultVibrateTimings/defaultSound) so the
      // urgency still comes through on older devices and as defense-in-
      // depth if the activity-alarms channel never made it onto the device.
      const fcmOptions = {
        // v2 = the channel with the long triple-pulse vibration pattern set
        // up natively in SystemSettingsPlugin.createAlarmChannel. v1
        // ('activity-alarms') is deleted on app init so this won't fall
        // through to it.
        ...(isAlarm ? { androidChannelId: 'activity-alarms-v2' as const, alarm: true } : {}),
        androidVisibility: (screenlockMap[uid] ? 'public' : 'private') as 'public' | 'private',
      }
      if (token)  { await sendFCM(token, pushTitle, body, data, fcmOptions); sent++ }
      if (webSub) { await sendWebPush(webSub, pushTitle, body, data); if (!token) sent++ }
    }))

    // In-app notification only for the reminder category, matching legacy behavior.
    // Inserted once per fire (not once per recipient) — the bell shows the latest.
    if (isReminderCategory) {
      await Promise.all(recipients.map(uid =>
        supabase.from('notifications').insert({
          recipient_id: uid,
          actor_id: uid,
          type: 'activity_reminder',
          activity_id: fire.activityId,
          message: `🔔 Recordatorio: ${fire.title}`,
        })
      ))
    }
  }))

  return NextResponse.json({ sent, fires: fires.length })
}
