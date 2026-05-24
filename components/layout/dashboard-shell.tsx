'use client'

import { useState, useEffect } from 'react'
import { AppSidebar } from './app-sidebar'
import { MobileBottomNav } from './mobile-bottom-nav'
import { cn } from '@/lib/utils'
import { initPushNotifications } from '@/lib/push-notifications'
import { initVersionCheck } from '@/lib/version-check'
import { initRevenueCat } from '@/lib/billing/revenuecat'
import { PaywallProvider } from '@/components/paywall/paywall-provider'
import { startWidgetAuthSync } from '@/lib/widget-sync'
import { BackButtonProvider } from '@/lib/back-button'
import { DateTimePrefsProvider } from '@/lib/datetime-prefs'
import { ProfileProvider, useProfile } from '@/lib/profile-context'
import { TopProgressBar } from './top-progress-bar'
import type { Profile } from '@/types'

interface DashboardShellProps {
  profile: Profile | null
  children: React.ReactNode
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  return (
    <ProfileProvider initialProfile={profile}>
      <DashboardShellInner>{children}</DashboardShellInner>
    </ProfileProvider>
  )
}

// Inner shell reads the live profile from context so an in-app edit
// (name, color, etc.) propagates to the sidebar / bottom nav without
// a remount or refetch.
function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (profile?.id) initPushNotifications(profile.id)
  }, [profile?.id])

  useEffect(() => {
    if (profile?.id) initRevenueCat(profile.id)
  }, [profile?.id])

  // Check Play Store for a newer APK once per dashboard mount. Forced (immediate)
  // when installed versionCode < NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE,
  // otherwise a soft flexible update. Web / iOS are no-ops.
  useEffect(() => { initVersionCheck() }, [])

  // Mirror the Supabase session into native storage so the home-screen widget
  // can refresh / toggle-done on its own. Hoisted to the dashboard shell so
  // the auth stays in sync regardless of which dashboard sub-page the user
  // is on (previously only the calendar view ran this).
  useEffect(() => startWidgetAuthSync(), [])

  // NOTE: pull-to-refresh used to live here. It was removed because the
  // touch listeners attached to the outer <main> were interfering with
  // nested scrollable areas (calendar grid, day panel, time-grid, modals)
  // even with the touchedScrollable guard — testers were seeing jumpy
  // scroll behaviour. Use the in-app refresh button + Supabase Realtime
  // for live updates instead.

  return (
    <BackButtonProvider>
    <PaywallProvider>
    <DateTimePrefsProvider>
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Top progress bar — fixed, shows on every route change. Gives users
          instant visual feedback that their tap registered, masking the
          page-rendering latency that otherwise reads as "lag". */}
      <TopProgressBar />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'shrink-0 xl:flex',
        sidebarOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden'
      )}>
        <AppSidebar profile={profile} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>

        {/* ── Bottom navigation — mobile only ── */}
        <MobileBottomNav userId={profile?.id} onMenuClick={() => setSidebarOpen(true)} />
      </div>
    </div>
    </DateTimePrefsProvider>
    </PaywallProvider>
    </BackButtonProvider>
  )
}
