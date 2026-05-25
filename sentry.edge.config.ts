import * as Sentry from '@sentry/nextjs'

// Edge runtime init — used by middleware.ts and any route that opts into
// the Edge runtime. The Edge SDK is intentionally minimal (no Node-only
// integrations) so we just configure DSN, env, and a low trace rate.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_ENV ?? 'development',
  tracesSampleRate: 0.1,
})
