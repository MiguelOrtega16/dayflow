'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/lib/profile-context'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { initAdMob, showBottomBanner, hideBottomBanner } from '@/lib/admob'
import { getAdSuppressed, subscribeAdSuppress } from '@/lib/ad-suppress'

// The AdMob banner is a native view the plugin floats `margin` dp above the
// bottom of the SAME view the WebView lives in. So the correct offset is simply
// the bottom nav's FULL rendered height as the WebView measures it — the h-14
// row PLUS pb-[safe-area-inset-bottom]. That single number is right on every
// device: on edge-to-edge devices env() reports the gesture inset (so the nav,
// and thus our offset, grows by it); on non-edge-to-edge devices env() is 0 and
// the system bar is already outside the banner's coordinate space. We deliberately
// do NOT add the system inset separately — the patched plugin honors this margin
// verbatim on Android 15+ (upstream otherwise discards it and substitutes the raw
// inset, which overlapped the nav). See patches/@capacitor-community+admob+8.0.0.patch.
// Falls back to 56 only if the nav isn't mounted yet.
const BOTTOM_NAV_FALLBACK_PX = 56

function getBottomNavOffsetPx(): number {
  if (typeof document === 'undefined') return BOTTOM_NAV_FALLBACK_PX
  const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
  const h = nav?.getBoundingClientRect().height ?? 0
  return h > 0 ? Math.ceil(h) : BOTTOM_NAV_FALLBACK_PX
}

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
      // Measure the nav now (post-mount) so the banner clears its full height
      // including the gesture-nav safe-area inset.
      await showBottomBanner(getBottomNavOffsetPx())
    })()

    return () => {
      cancelled = true
      hideBottomBanner()
      setBottomPadding(false)
    }
  }, [entitlement.isPro, loading, suppressed])

  return null
}
