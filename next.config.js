const { withSentryConfig } = require('@sentry/nextjs')
const pkg = require('./package.json')

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  // Make environment label available everywhere in the app
  env: {
    NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV ?? 'development',
  },

  // PostHog reverse proxy — bypasses Firefox ETP / uBlock / Brave Shields which
  // block requests to *.posthog.com by default. The SDK is configured to send
  // events to /ingest, which we rewrite to PostHog's real ingest + assets hosts.
  // Skipped for Capacitor static builds (rewrites need a Next.js server) and
  // skipped on the native client, which bypasses the proxy entirely (no browser
  // extensions inside the webview, no need).
  ...(!isCapacitorBuild && {
    skipTrailingSlashRedirect: true,
    async rewrites() {
      return [
        { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
        { source: '/ingest/decide',        destination: 'https://us.i.posthog.com/decide' },
        { source: '/ingest/:path*',        destination: 'https://us.i.posthog.com/:path*' },
      ]
    },
  }),

  // Needed for Capacitor static builds (only active when CAPACITOR_BUILD=true)
  ...(isCapacitorBuild && {
    output: 'export',
    trailingSlash: true,
  }),
}

// Wrap with Sentry config so source maps upload on Vercel builds and the
// Sentry build-time instrumentation gets injected. Source map upload only
// happens when SENTRY_AUTH_TOKEN is present (Vercel env), so local dev
// builds still pass cleanly without it. Capacitor static exports also skip
// the upload step — we'd rather ship without maps than fail the export.
module.exports = withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Tag every event with the app's semver so we can filter "errors since
  // 1.13.1" in the Sentry UI.
  release: { name: `dayflow@${pkg.version}` },
  // Don't try to upload source maps when we're producing a static export
  // for Capacitor — there's no Vercel build step to hand them off to.
  sourcemaps: { disable: isCapacitorBuild },
  // Hide auth-token-related errors during local dev where the token isn't set.
  disableLogger: true,
  // Auto-instrument Vercel cron jobs as Sentry monitors so we get alerted
  // if activity-30min-reminders / activity-reminders stops running.
  automaticVercelMonitors: true,
})
