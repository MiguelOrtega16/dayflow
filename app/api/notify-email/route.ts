import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ skipped: 'no api key' })

  const { recipientId, senderName, subject, bodyHtml } = await request.json()
  if (!recipientId || !subject || !bodyHtml) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = await createClient()

  // Check recipient's email notification preference
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, email_notifications')
    .eq('id', recipientId)
    .single()

  if (!profile?.email || profile.email_notifications === false) {
    return NextResponse.json({ skipped: 'notifications disabled or no email' })
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'DayFlow <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: fromAddress,
      to: [profile.email],
      subject,
      html: bodyHtml,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-email] Resend error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
