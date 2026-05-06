import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFCM, getFirebaseMessaging } from '@/lib/firebase-admin'

export async function POST(request: Request) {
  const { recipientId, title, body } = await request.json()
  if (!recipientId || !title) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    return NextResponse.json({ skipped: 'Firebase not configured' })
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token')
    .eq('id', recipientId)
    .single()

  if (!profile?.fcm_token) {
    return NextResponse.json({ skipped: 'no FCM token for recipient' })
  }

  await sendFCM(profile.fcm_token, title, body ?? '')
  return NextResponse.json({ sent: true })
}
