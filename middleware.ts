import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Exclude PostHog proxy path so analytics traffic skips the Supabase
    // session update — the rewrite goes straight to PostHog's servers.
    '/((?!_next/static|_next/image|favicon.ico|ingest/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
