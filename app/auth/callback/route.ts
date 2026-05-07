import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // `next` lets callers specify where to land after the exchange:
  //   email confirmation  → /dashboard  (default, no next param)
  //   password reset      → /auth/reset-password  (set by forgot-password page)
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
      )
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
