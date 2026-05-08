import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { NavigationProgress } from '@/components/layout/navigation-progress'
import { SplashScreen } from '@/components/layout/splash-screen'

export const metadata: Metadata = {
  title: 'DayFlow — Metas y actividades diarias compartidas',
  description: 'Registra tus metas, tareas y hábitos diarios. Comparte tu progreso con otros.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    shortcut: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DayFlow',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <SplashScreen />
          <NavigationProgress />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
