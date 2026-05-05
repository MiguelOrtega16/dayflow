import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const serverKey = process.env.FCM_SERVER_KEY
  if (!serverKey) return NextResponse.json({ skipped: 'no FCM key configured' })

  const { recipientId, title, body } = await request.json()
  if (!recipientId || !title) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token')
    .eq('id', recipientId)
    .single()

  if (!profile?.fcm_token) {
    return NextResponse.json({ skipped: 'recipient has no FCM token' })
  }

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${serverKey}`,
    },
    body: JSON.stringify({
      to: profile.fcm_token,
      notification: { title, body },
      data: { url: '/dashboard' },
      priority: 'high',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[send-push] FCM error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
