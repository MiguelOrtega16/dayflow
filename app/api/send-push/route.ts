import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFCM, sendWebPush, getFirebaseMessaging } from '@/lib/firebase-admin'

export async function POST(request: Request) {
  const { recipientId, title, body, type, date, activityId } = await request.json()
  if (!recipientId || !title) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token, web_push_subscription')
    .eq('id', recipientId)
    .single()

  if (!profile?.fcm_token && !profile?.web_push_subscription) {
    return NextResponse.json({ skipped: 'no push channel for recipient' })
  }

  const extraData: Record<string, string> = {}
  if (type)       extraData.type       = type
  if (date)       extraData.date       = date
  if (activityId) extraData.activityId = activityId

  const messaging = await getFirebaseMessaging()
  if (profile.fcm_token && messaging) {
    await sendFCM(profile.fcm_token, title, body ?? '', extraData)
  }
  if (profile.web_push_subscription) {
    await sendWebPush(profile.web_push_subscription, title, body ?? '', extraData)
  }

  return NextResponse.json({ sent: true })
}
