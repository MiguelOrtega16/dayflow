'use client'

import { useState, useEffect } from 'react'
import { AppSidebar } from './app-sidebar'
import { MobileBottomNav } from './mobile-bottom-nav'
import { cn } from '@/lib/utils'
import { initPushNotifications } from '@/lib/push-notifications'
import { initVersionCheck } from '@/lib/version-check'
import { initRevenueCat } from '@/lib/billing/revenuecat'
import { initAdMob } from '@/lib/admob'
import { pushAdSuppress } from '@/lib/ad-suppress'
import { PaywallProvider } from '@/components/paywall/paywall-provider'
import { startWidgetAuthSync, syncWidgetSnapshot } from '@/lib/widget-sync'
import { DailySummary } from '@/lib/daily-summary'
import { DeepLink } from '@/lib/deeplink'
import { getUserPreferences } from '@/lib/user-preferences'
import { BackButtonProvider } from '@/lib/back-button'
import { DateTimePrefsProvider } from '@/lib/datetime-prefs'
import { ProfileProvider, useProfile } from '@/lib/profile-context'
import { TopProgressBar } from './top-progress-bar'
import { ForceUpdateGate } from './force-update-gate'
import { getDiscoveryDots, markDiscoverySeen } from '@/lib/onboarding/discovery-dots'
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
  const { profile, setProfile } = useProfile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // First-run discovery dots — only render for accounts created after the
  // release cutoff (see lib/onboarding/discovery-dots.ts).
  const dots = getDiscoveryDots(profile)
  const handleMenuOpen = () => {
    setSidebarOpen(true)
    if (dots.menu) markDiscoverySeen(profile, setProfile, 'menu')
  }

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

  // AdMob init runs once per dashboard mount. Internally gated by
  // NEXT_PUBLIC_ENABLE_ADS=1 and the Android-native platform check — when
  // either is false this is a fast no-op, so it's safe to call even while
  // the app is still on the Play testing track.
  useEffect(() => { initAdMob() }, [])

  // The sidebar drawer slides over the bottom of the screen on mobile.
  // The native AdMob banner would otherwise cover the Settings menu item
  // and profile chip at the drawer's bottom. Suppress while open.
  useEffect(() => {
    if (!sidebarOpen) return
    return pushAdSuppress('sidebar')
  }, [sidebarOpen])

  // Mirror the Supabase session into native storage so the home-screen widget
  // can refresh / toggle-done on its own. Hoisted to the dashboard shell so
  // the auth stays in sync regardless of which dashboard sub-page the user
  // is on (previously only the calendar view ran this).
  useEffect(() => startWidgetAuthSync(), [])

  // Sync the widget snapshot whenever the app goes to background. Catches
  // the case where the modal-side sync silently failed (network blip during
  // create) or the user created activities and bounced before any in-app
  // refresh ran. Android's automatic widget update tick is ~30 min, which
  // testers found too slow — a tester saw 22 min of stale data before
  // having to open the app + return to refresh. Doing this on hidden
  // means the widget gets fresh data the moment the user leaves the app.
  useEffect(() => {
    if (!profile?.id) return
    const uid = profile.id
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        syncWidgetSnapshot(uid).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [profile?.id])

  // Cold-start deep link consumer: when MainActivity launches via a
  // notification / widget action (e.g. daily-summary + Task), the WebView
  // is still loading and its evaluateJavascript path is unreliable. The
  // native side stashes the target path in SharedPreferences instead;
  // here we drain that queue once on mount and force-navigate. Using
  // window.location.href (not router.push) so every downstream useEffect
  // — calendar-view's ?create= / ?view=day readers in particular —
  // re-reads the URL fresh. Warm-path taps continue to go through the
  // evaluateJavascript fast path in MainActivity.
  useEffect(() => {
    DeepLink.consumePending().then(path => {
      if (path) window.location.href = path
    }).catch(() => { /* no-op on web */ })
  }, [])

  // Daily summary tray entry: mirror the user's stored preference into the
  // native plugin's local toggle (a brand-new device install starts with
  // "on" anyway, but an existing user who turned it off on another device
  // should see that respected when they sign in here), then post a fresh
  // summary so the tray reflects today's data immediately.
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    getUserPreferences(profile.id).then(prefs => {
      if (cancelled) return
      DailySummary.setEnabled(prefs.daily_summary_notification).catch(() => {})
    }).catch(() => {
      // If we can't read prefs (e.g. offline), fall back to a refresh so
      // an already-enabled summary at least updates today's count.
      DailySummary.refresh().catch(() => {})
    })
    return () => { cancelled = true }
  }, [profile?.id])

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

      {/* Forced-update gate — full-screen blocking modal for users on an
          unsupported Android versionCode. No-op on web/iOS and on supported
          builds. Mounted at z-[100] so it sits above every other surface. */}
      <ForceUpdateGate />

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

        <main
          className="flex-1 overflow-auto min-w-0"
          style={{ paddingBottom: 'var(--ad-bottom-padding, 0px)' }}
        >
          {children}
        </main>

        {/* ── Bottom navigation — mobile only ── */}
        <MobileBottomNav userId={profile?.id} onMenuClick={handleMenuOpen} showMenuDot={dots.menu} />
      </div>
    </div>
    </DateTimePrefsProvider>
    </PaywallProvider>
    </BackButtonProvider>
  )
}
