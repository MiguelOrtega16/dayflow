import * as Sentry from '@sentry/nextjs'

// Client-side Sentry init for the browser (and the Capacitor WebView, which
// runs the same bundle). Next.js 15 picks this file up automatically when
// it sits at the project root.
//
// Cost knobs:
//   - tracesSampleRate 0.1: 10% of transactions get full performance traces.
//     Errors are always captured at 100%.
//   - replaysOnErrorSampleRate 1.0: every errored session records a replay.
//     This is the main "what was the user doing?" signal we'd want and the
//     cost stays bounded because it only fires on errors.
//   - replaysSessionSampleRate 0: no baseline replay capture. Bump if we
//     need to spot UX issues that don't throw.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV ?? 'development',

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text + media in replays by default. Activity titles,
      // comments, notes — none of it should leave the device verbatim.
      // Reviewers see structure but not content.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event) {
    return scrubPii(event)
  },
  beforeSendTransaction(event) {
    return scrubPii(event)
  },
})

// Drop common PII before the event leaves the client.
//   - email: only the domain is kept (useful for grouping by host, not by user)
//   - URL query strings: stripped from request + breadcrumb URLs
//   - tag values matching emails / UUIDs are not auto-scrubbed (we control them)
//
// Sentry's server-side data scrubber also runs, but doing it here means the
// payload never crosses the wire in the first place.
function scrubPii<T extends { user?: { email?: string }; request?: { url?: string }; breadcrumbs?: Array<{ data?: Record<string, unknown> }> }>(event: T): T {
  if (event.user?.email) {
    const [, domain] = event.user.email.split('@')
    event.user.email = domain ? `redacted@${domain}` : 'redacted'
  }
  if (event.request?.url) {
    event.request.url = stripQuery(event.request.url)
  }
  event.breadcrumbs?.forEach(b => {
    const url = b.data?.url
    if (typeof url === 'string') b.data!.url = stripQuery(url)
  })
  return event
}

function stripQuery(url: string): string {
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}

// Required so Next.js can capture client-side navigation errors as
// transactions. Re-exported from @sentry/nextjs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
