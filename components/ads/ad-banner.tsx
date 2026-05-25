'use client'

import { useEffect } from 'react'
import { useProfile } from '@/lib/profile-context'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { initAdMob, showBottomBanner, hideBottomBanner } from '@/lib/admob'

// Height in CSS pixels of the mobile bottom nav (.h-14 in mobile-bottom-nav.tsx).
// AdMob banner is rendered as a native view at the bottom of the screen and
// needs this offset so it sits above the nav instead of covering it. The
// safe-area inset is absorbed by the nav itself, so we don't double-count it.
const BOTTOM_NAV_HEIGHT_PX = 56

/**
 * Mount this on any page where a bottom banner is welcome. Renders nothing
 * in the DOM — the banner is a native Android view managed by the AdMob
 * SDK. Show is gated on:
 *   - Capacitor native Android build (web + iOS are no-ops via initAdMob)
 *   - Entitlement loaded (avoids a brief banner flash for Pro users)
 *   - User is NOT Pro
 *
 * Unmounts hide the banner so navigating to a non-banner page (e.g. the
 * Calendar) immediately reclaims the bottom strip.
 */
export function AdBanner() {
  const { profile } = useProfile()
  const { entitlement, loading } = useEntitlement(profile?.id ?? null)

  useEffect(() => {
    if (loading) return
    if (entitlement.isPro) return

    let cancelled = false
    ;(async () => {
      await initAdMob()
      if (cancelled) return
      await showBottomBanner(BOTTOM_NAV_HEIGHT_PX)
    })()

    return () => {
      cancelled = true
      hideBottomBanner()
    }
  }, [entitlement.isPro, loading])

  return null
}
