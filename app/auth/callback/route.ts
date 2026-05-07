import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  // `next` is still supported as an override, but the route now auto-detects
  // password-recovery sessions so the forgot-password page doesn't need to
  // include query params in its redirectTo (which broke Supabase URL matching).
  const next  = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
      )
    }

    // Auto-detect recovery sessions: if recovery_sent_at is set the user
    // clicked a password-reset link, so send them to the reset form.
    const { data: { user } } = await supabase.auth.getUser()
    const isRecovery = !!user?.recovery_sent_at

    const destination = next ?? (isRecovery ? '/auth/reset-password' : '/dashboard')
    return NextResponse.redirect(`${origin}${destination}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
