import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lazy-initialise Firebase Admin so the module only loads when needed
let messagingInstance: import('firebase-admin/messaging').Messaging | null = null

async function getMessaging() {
  if (messagingInstance) return messagingInstance

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getMessaging }                  = await import('firebase-admin/messaging')

    if (!getApps().length) {
      initializeApp({ credential: cert(JSON.parse(raw)) })
    }

    messagingInstance = getMessaging()
    return messagingInstance
  } catch (err) {
    console.error('[send-push] Firebase Admin init error:', err)
    return null
  }
}

export async function POST(request: Request) {
  const { recipientId, title, body } = await request.json()
  if (!recipientId || !title) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const messaging = await getMessaging()
  if (!messaging) {
    // Firebase not configured yet — fail silently so it never breaks the main flow
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

  try {
    await messaging.send({
      token: profile.fcm_token,
      notification: { title, body },
      data: { url: '/dashboard' },
      android: { priority: 'high' },
      apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
    })
    return NextResponse.json({ sent: true })
  } catch (err: any) {
    // Push errors are never fatal — log and continue
    console.error('[send-push] FCM send error:', err?.message ?? err)
    return NextResponse.json({ skipped: err?.message ?? 'FCM error' })
  }
}
