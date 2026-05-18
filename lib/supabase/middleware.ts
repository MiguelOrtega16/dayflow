import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // If Supabase sent an auth code to any URL other than /auth/callback
  // (e.g. the root because the redirectTo wasn't in the allow-list), catch it
  // here and route it to the callback handler before doing anything else.
  const code = request.nextUrl.searchParams.get('code')
  if (code && !request.nextUrl.pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ['/delete-account', '/api/cron/', '/api/send-push', '/api/webhooks/']
  if (!user && !request.nextUrl.pathname.startsWith('/auth') && !publicPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Allow these even when authenticated: callback must run to exchange codes,
  // reset-password must be reachable with the recovery session active.
  const authBypass = ['/auth/callback', '/auth/reset-password']
  if (
    user &&
    request.nextUrl.pathname.startsWith('/auth') &&
    !authBypass.some(p => request.nextUrl.pathname.startsWith(p))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
