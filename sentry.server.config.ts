import * as Sentry from '@sentry/nextjs'

// Server-side Sentry init for Vercel's Node runtime. Static Capacitor builds
// never load this — they have no Next.js server. Cost knobs intentionally
// match the client config so we can read traces end-to-end.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_ENV ?? 'development',
  tracesSampleRate: 0.1,
})
