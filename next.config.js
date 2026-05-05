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

  // Needed for Capacitor static builds (only active when CAPACITOR_BUILD=true)
  ...(process.env.CAPACITOR_BUILD === 'true' && {
    output: 'export',
    trailingSlash: true,
  }),
}

module.exports = nextConfig
