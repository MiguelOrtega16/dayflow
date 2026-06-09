import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Exclude PostHog proxy path so analytics traffic skips the Supabase
    // session update — the rewrite goes straight to PostHog's servers.
    //
    // Also exclude root static text files (txt|xml) — e.g. /app-ads.txt, which
    // AdMob's crawler fetches unauthenticated. Without this the auth redirect
    // below sends the crawler to /auth/login and AdMob can't verify the app.
    '/((?!_next/static|_next/image|favicon.ico|ingest/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)',
  ],
}
