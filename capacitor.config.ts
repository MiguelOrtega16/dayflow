import type { CapacitorConfig } from '@capacitor/cli'

// Set CAPACITOR_ENV=production when building for the Play Store / App Store.
// Default is development, which loads from your local Next.js dev server.
const capacitorEnv = process.env.CAPACITOR_ENV ?? 'development'
const isProd = capacitorEnv === 'production'

const config: CapacitorConfig = {
  appId:   'com.chanclastudio.dayflow',
  appName: 'DayFlow',
  webDir:  'out',

  // Approach A: load from remote server — no static build needed.
  // Dev  → points at your local Next.js dev server (npm run dev must be running)
  // Prod → points at your live Vercel deployment
  server: {
    url:       isProd ? 'https://day-flow.co' : 'http://localhost:3000',
    cleartext: !isProd,   // allow plain HTTP only for local dev
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },

  ios: {
    contentInset: 'always',
  },

  android: {
    allowMixedContent: !isProd,
  },
}

export default config
