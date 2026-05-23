'use client'

import { useEffect, useRef } from 'react'

/**
 * Adds an iOS-style swipe-back gesture: when the user swipes right from
 * near the left edge of the screen, the provided callback fires. Used on
 * settings sub-pages to mirror the hardware-back behavior on touch
 * devices — Android phones running inside the Capacitor WebView don't
 * get the system's edge-swipe automatically, so we re-implement it for
 * the screens where it's expected.
 *
 * Detection thresholds:
 *   - startX must be within the left 30 px so internal horizontal
 *     scrollables in the page (e.g. color-swatch rows) aren't hijacked
 *     by every right-leaning drag.
 *   - dx > 80 px so a short flick doesn't trigger a navigation.
 *   - |dx| > |dy| * 2 enforces a clearly horizontal gesture and lets
 *     diagonal-but-mostly-vertical scrolls pass through.
 *
 * No-ops cleanly when run server-side (the effect doesn't fire) or on
 * non-touch devices (the events never come).
 */
export function useSwipeBack(onSwipeBack: () => void): void {
  // Keep the latest callback in a ref so the listener doesn't need to
  // re-bind every render — important because callers commonly pass an
  // arrow function like `() => router.push(...)`.
  const cbRef = useRef(onSwipeBack)
  useEffect(() => { cbRef.current = onSwipeBack }, [onSwipeBack])

  useEffect(() => {
    let startX = 0
    let startY = 0
    let armed  = false

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { armed = false; return }
      const t = e.touches[0]
      armed = t.clientX <= 30
      startX = t.clientX
      startY = t.clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!armed) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
        cbRef.current()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])
}
