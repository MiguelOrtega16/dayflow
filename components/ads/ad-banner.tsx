'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/lib/profile-context'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { initAdMob, showBottomBanner, hideBottomBanner } from '@/lib/admob'
import { getAdSuppressed, subscribeAdSuppress } from '@/lib/ad-suppress'

// Height in CSS pixels of the mobile bottom nav (.h-14 in mobile-bottom-nav.tsx).
// AdMob banner is rendered as a native view at the bottom of the screen and
// needs this offset so it sits above the nav instead of covering it. The
// safe-area inset is absorbed by the nav itself, so we don't double-count it.
const BOTTOM_NAV_HEIGHT_PX = 56

// Vertical room (above the bottom nav) the banner occupies. Exposed as a
// CSS variable so scroll containers can pad their content out of the
// banner's way. Slightly larger than the adaptive banner's typical height
// to leave a few px of breathing room.
const AD_BOTTOM_PADDING_PX = 64
const AD_BOTTOM_PADDING_CSS_VAR = '--ad-bottom-padding'

function setBottomPadding(active: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(
    AD_BOTTOM_PADDING_CSS_VAR,
    active ? `${AD_BOTTOM_PADDING_PX}px` : '0px',
  )
}

// Build-time kill switch. Mirrors the gate in lib/admob.ts so we don't even
// pay for the entitlement subscription when ads are off. A single env-var
// flip + rebuild turns the whole pipeline on.
const ADS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ADS === '1'

/**
 * Mount this on any page where a bottom banner is welcome. Renders nothing
 * in the DOM — the banner is a native Android view managed by the AdMob
 * SDK. Show is gated on:
 *   - NEXT_PUBLIC_ENABLE_ADS=1 at build time (off → instant noop)
 *   - Capacitor native Android build (web + iOS are no-ops via initAdMob)
 *   - Entitlement loaded (avoids a brief banner flash for Pro users)
 *   - User is NOT Pro
 *
 * Unmounts hide the banner so navigating to a non-banner page (e.g. the
 * Calendar) immediately reclaims the bottom strip.
 */
export function AdBanner() {
  if (!ADS_ENABLED) return null
  return <AdBannerInner />
}

function AdBannerInner() {
  const { profile } = useProfile()
  const { entitlement, loading } = useEntitlement(profile?.id ?? null)
  // Subscribe to suppression sources (sidebar drawer, paywall modal, etc.).
  // When any source is active, the banner is torn down so it doesn't
  // overlay the obscuring UI; it comes back as soon as the set empties.
  const [suppressed, setSuppressed] = useState<boolean>(getAdSuppressed)
  useEffect(() => subscribeAdSuppress(() => setSuppressed(getAdSuppressed())), [])

  useEffect(() => {
    if (loading) return
    if (entitlement.isPro) {
      setBottomPadding(false)
      return
    }
    if (suppressed) {
      // Make sure any banner from before is gone — covers the case where
      // the suppression source opened after the banner was already shown.
      hideBottomBanner()
      setBottomPadding(false)
      return
    }

    setBottomPadding(true)
    let cancelled = false
    ;(async () => {
      await initAdMob()
      if (cancelled) return
      await showBottomBanner(BOTTOM_NAV_HEIGHT_PX)
    })()

    return () => {
      cancelled = true
      hideBottomBanner()
      setBottomPadding(false)
    }
  }, [entitlement.isPro, loading, suppressed])

  return null
}
