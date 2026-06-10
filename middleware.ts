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
    // Also exclude root static files (txt|xml|html) so they serve publicly —
    // e.g. /app-ads.txt (AdMob's verification crawler) and /privacy-policy.html
    // (linked from the AdMob EU consent form + the Play listing, fetched
    // unauthenticated). Without this the auth redirect sends those requests to
    // /auth/login and AdMob/Play can't read them.
    // Finally, exclude all static assets (e.g. .svg, .png, .jpg, .jpeg, .gif, .webp) to avoid unnecessary session updates for those requests.
    '/((?!_next/static|_next/image|favicon.ico|ingest/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml|html)$).*)',
  ],
}
