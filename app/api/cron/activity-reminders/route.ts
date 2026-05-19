import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFCM, sendWebPush, type WebPushAction } from '@/lib/firebase-admin'
import { localDateStr, localHour } from '@/lib/tz-utils'

function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour  = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

const EVENING_MESSAGES = [
  '¿Cuánto lograste hoy? Revisa tus actividades 📋',
  'Tómate un momento para ver tu día 🌙',
  '¿Completaste todo lo planeado? Échale un vistazo ✨',
  'Cierra tu día con orden. Revisa tus actividades 💫',
  'Un día más, un paso más cerca de tus metas 🎯',
  '¿Cómo estuvo el día? Marca lo que lograste ✅',
]
const randomEvening = () => EVENING_MESSAGES[Math.floor(Math.random() * EVENING_MESSAGES.length)]

async function notify(
  token: string | null,
  webSub: any,
  title: string,
  body: string,
  data: Record<string, string>,
  actions?: WebPushAction[],
) {
  if (token)  await sendFCM(token, title, body, data)
  if (webSub) await sendWebPush(webSub, title, body, data, actions)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const appTz = process.env.APP_TIMEZONE ?? 'UTC'
  const now   = new Date()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch all users that have at least one push channel
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fcm_token, web_push_subscription, timezone, preferences')

  if (!profiles?.length) return NextResponse.json({ sent: 0 })

  // Bucket each user by their local hour. Per-user prefs override the
  // defaults (7 AM morning, 8 PM evening); 'off' drops the user from the
  // bucket; a numeric value picks a custom hour.
  const morningUsers: typeof profiles = []
  const eveningUsers: typeof profiles = []

  const slotHour = (slot: unknown, defaultHour: number): number | null => {
    if (slot === 'off') return null
    if (typeof slot === 'number' && slot >= 0 && slot <= 23) return Math.floor(slot)
    return defaultHour
  }

  for (const p of profiles) {
    if (!p.fcm_token && !p.web_push_subscription) continue
    const tz = (p as any).timezone || appTz
    const hour = localHour(now, tz)
    const prefs = ((p as any).preferences ?? {}) as Record<string, unknown>
    const morningHour = slotHour(prefs.morning_reminder, 7)
    const eveningHour = slotHour(prefs.evening_review,   20)
    if (morningHour !== null && hour === morningHour) morningUsers.push(p)
    if (eveningHour !== null && hour === eveningHour) eveningUsers.push(p)
  }

  let sent = 0

  // ── Evening engagement (8 PM) ──────────────────────────────────────────────
  await Promise.all(eveningUsers.map(async p => {
    const tz       = (p as any).timezone || appTz
    const todayStr = localDateStr(now, tz)
    await notify(p.fcm_token, (p as any).web_push_subscription,
      '🌙 DayFlow', randomEvening(),
      { type: 'activity_reminder', date: todayStr })
    sent++
  }))

  // ── Morning digest (7 AM) ──────────────────────────────────────────────────
  if (morningUsers.length === 0) {
    return NextResponse.json({ sent, reason: sent ? 'evening only' : 'no users at 7am or 8pm' })
  }

  const morningIds = morningUsers.map(p => p.id)

  const dateByTz  = new Map<string, string>()
  const userTzMap = new Map<string, string>()
  for (const p of morningUsers) {
    const tz = (p as any).timezone || appTz
    userTzMap.set(p.id, tz)
    if (!dateByTz.has(tz)) dateByTz.set(tz, localDateStr(now, tz))
  }

  const localDates = Array.from(new Set(dateByTz.values()))

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, emoji, description, user_id, start_time, date')
    .in('user_id', morningIds)
    .in('date', localDates)
    .not('start_time', 'is', null)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[activity-reminders] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: invitedActivities } = await supabase
    .from('activity_invitations')
    .select('activity_id, invitee_id, activities(id, title, emoji, user_id, start_time, date)')
    .in('invitee_id', morningIds)
    .eq('status', 'accepted')

  const byUser: Record<string, Array<{ id: string; title: string; emoji: string | null; start_time: string; date: string }>> = {}
  for (const uid of morningIds) byUser[uid] = []

  for (const act of activities ?? []) byUser[act.user_id]?.push(act)
  for (const inv of invitedActivities ?? []) {
    const act = (inv as any).activities
    const uid = inv.invitee_id
    if (act && byUser[uid]) {
      const userDate = dateByTz.get(userTzMap.get(uid)!)
      if (act.date === userDate && act.start_time) byUser[uid].push(act)
    }
  }

  await Promise.all(morningUsers.map(async p => {
    const webSub   = (p as any).web_push_subscription
    const todayStr = dateByTz.get(userTzMap.get(p.id)!)!
    const acts     = (byUser[p.id] ?? [])
      .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    const count = acts.length

    const morningActions: WebPushAction[] = [
      { action: 'create', title: '➕ Nueva actividad' },
    ]

    if (count === 0) {
      await notify(p.fcm_token, webSub, '☀️ Buenos días',
        'No tienes actividades programadas para hoy.',
        { type: 'activity_reminder', date: todayStr },
        morningActions)
    } else {
      const title = `📅 Tienes ${count} actividad${count > 1 ? 'es' : ''} hoy`
      const lines = acts.slice(0, 4).map(a =>
        `${formatTime(a.start_time)} — ${a.emoji ? `${a.emoji} ${a.title}` : a.title}`
      )
      if (count > 4) lines.push(`…y ${count - 4} más`)
      await notify(p.fcm_token, webSub, title, lines.join('\n'),
        { type: 'activity_reminder', date: todayStr },
        morningActions)
    }
    sent++
  }))

  return NextResponse.json({ sent, morning: morningUsers.length, evening: eveningUsers.length })
}
