import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFCM, sendWebPush, getFirebaseMessaging } from '@/lib/firebase-admin'
import { channelIdForSound, DEFAULT_SOUND_ID } from '@/lib/notification-sounds'

export async function POST(request: Request) {
  const { recipientId, title, body, type, date, activityId } = await request.json()
  if (!recipientId || !title) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token, web_push_subscription, preferences')
    .eq('id', recipientId)
    .single()

  if (!profile?.fcm_token && !profile?.web_push_subscription) {
    return NextResponse.json({ skipped: 'no push channel for recipient' })
  }

  const extraData: Record<string, string> = {}
  if (type)       extraData.type       = type
  if (date)       extraData.date       = date
  if (activityId) extraData.activityId = activityId

  // Route Android pushes through the channel carrying the recipient's chosen
  // notification sound ('activity-reminders' for the default sound).
  const prefs = (profile.preferences ?? {}) as Record<string, unknown>
  const androidChannelId = channelIdForSound(
    typeof prefs.notification_sound === 'string' ? prefs.notification_sound : DEFAULT_SOUND_ID,
  )

  const messaging = await getFirebaseMessaging()
  if (profile.fcm_token && messaging) {
    await sendFCM(profile.fcm_token, title, body ?? '', extraData, { androidChannelId })
  }
  if (profile.web_push_subscription) {
    await sendWebPush(profile.web_push_subscription, title, body ?? '', extraData)
  }

  return NextResponse.json({ sent: true })
}
