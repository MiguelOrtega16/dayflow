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

module.exports = nextConfig
