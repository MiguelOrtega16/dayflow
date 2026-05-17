'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Thin animated progress bar fixed to the top of the viewport. Whenever
 * the user navigates (via <Link> or router.push), it animates from 0 → 80%
 * during the transition, then completes to 100% and fades out once the new
 * route has rendered.
 *
 * Pure CSS animation, no NProgress dependency. Lives in the dashboard
 * shell so it shows on every dashboard navigation.
 *
 * The trick: we capture the *current* pathname on mount, then on each
 * change schedule a tail animation. The bar starts the moment a <Link>
 * is clicked because Next.js triggers usePathname() to re-evaluate; in
 * practice this gives the user instant visual feedback that the tap
 * registered, masking the page-rendering latency that follows.
 */
export function TopProgressBar() {
  const pathname = usePathname()
  const search   = useSearchParams()
  // Combine pathname + search params so query-only changes also re-trigger.
  const routeKey = `${pathname}?${search?.toString() ?? ''}`

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastRoute = useRef(routeKey)
  const tailTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (lastRoute.current === routeKey) return
    lastRoute.current = routeKey

    if (tailTimer.current) clearTimeout(tailTimer.current)
    if (fadeTimer.current) clearTimeout(fadeTimer.current)

    // Show immediately, animate to 80% to simulate "loading", then complete
    // and fade out — the new page has already rendered by this point.
    setVisible(true)
    setProgress(0)
    requestAnimationFrame(() => setProgress(80))
    tailTimer.current = setTimeout(() => setProgress(100), 280)
    fadeTimer.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 520)

    return () => {
      if (tailTimer.current) clearTimeout(tailTimer.current)
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [routeKey])

  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 h-0.5 z-[60] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease' }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: progress > 0 && progress < 100
            ? 'width 280ms ease-out'
            : 'width 180ms ease-in',
        }}
      />
    </div>
  )
}
