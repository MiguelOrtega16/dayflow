'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * iOS-style swipe-back: the user drags from the left edge and the page
 * translates with their finger. If they release past a threshold (or with
 * enough flick velocity) the callback fires; otherwise the page snaps back
 * to its original position.
 *
 * Caller wires the returned ref to the page's outermost scroll/content
 * container — the hook applies inline transforms to that element during
 * the gesture and clears them on completion or cancel.
 *
 * Edge-arm: only gestures that start within the leftmost 30 px are
 * tracked, so internal horizontal scrollables (color swatches, etc.)
 * aren't hijacked.
 *
 * Native back navigation can't be animated through router.push because
 * the new page mounts before the old one unmounts. So when the threshold
 * fires we run the slide-out animation to completion first, then call
 * the callback — the perceived effect is the page sliding off-screen
 * before being replaced.
 */

const EDGE_PX        = 30      // drag must start within this many px of the left edge
const COMPLETE_PX    = 100     // dx past this on release → complete the back nav
const COMPLETE_RATIO = 0.4     // …or dx > viewport * this
const FLICK_PX_MS    = 0.5     // …or release velocity exceeds this
const MAX_DRAG_RATIO = 1.0     // cap drag at full viewport width

export function useSwipeBack<T extends HTMLElement = HTMLDivElement>(
  onSwipeBack: () => void
) {
  const ref = useRef<T | null>(null)
  // Keep the latest callback in a ref so the listener doesn't rebind every render.
  const cbRef = useRef(onSwipeBack)
  useEffect(() => { cbRef.current = onSwipeBack }, [onSwipeBack])

  // Tracked purely for re-renders we don't actually need — kept in case
  // a caller wants to read it. The transform itself is applied imperatively
  // because rAF + state updates produce frame drops on lower-end Androids.
  const [, setIsDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let startX = 0
    let startY = 0
    let startT = 0
    let dx     = 0
    let armed  = false
    let dragging = false

    const apply = (x: number) => {
      el.style.transform = x === 0 ? '' : `translateX(${x}px)`
    }

    const beginDrag = () => {
      if (dragging) return
      dragging = true
      // Suspend transition during finger-follow so motion stays 1:1.
      el.style.transition = 'none'
      // Subtle right-shadow so the sliding page reads as a layer above the
      // parent route. Cheap, no overlay element needed.
      el.style.boxShadow  = '-8px 0 24px rgba(0,0,0,0.18)'
      setIsDragging(true)
    }

    const endDrag = (settleTo: number, andThen?: () => void) => {
      // Restore a short transition so the snap-back / snap-out is animated.
      el.style.transition = 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)'
      el.style.transform  = settleTo === 0 ? '' : `translateX(${settleTo}px)`
      dragging = false
      setIsDragging(false)
      if (andThen) {
        // Kick off the navigation immediately. The destination (the parent
        // settings route) is normally in the Next.js prefetch cache, so it
        // mounts in parallel with the slide-out animation — no perceived
        // lag, and crucially no post-animation flicker. Previously we
        // waited for transitionend, then cleared styles, THEN navigated,
        // which made the page briefly snap back to its origin position
        // before the route swap landed. The unmount handles style cleanup
        // for us; no explicit clear needed.
        andThen()
      } else {
        // Snap-back: clear shadow after the transition completes so the
        // page doesn't keep the layered look once it's home.
        setTimeout(() => {
          if (!dragging) {
            el.style.boxShadow = ''
            el.style.transition = ''
          }
        }, 240)
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { armed = false; return }
      const t = e.touches[0]
      armed = t.clientX <= EDGE_PX
      if (!armed) return
      startX = t.clientX
      startY = t.clientY
      startT = e.timeStamp
      dx     = 0
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!armed) return
      const t = e.touches[0]
      const ddx = t.clientX - startX
      const ddy = t.clientY - startY
      // Only follow finger once the gesture is clearly horizontal — diagonal /
      // vertical drags belong to the page (scrolling, color rows, etc.).
      if (!dragging) {
        if (Math.abs(ddx) < 8) return
        if (Math.abs(ddx) <= Math.abs(ddy) * 1.4) {
          // Vertical-leaning gesture — disarm so we don't fight scrolling.
          armed = false
          return
        }
        beginDrag()
      }
      const max = window.innerWidth * MAX_DRAG_RATIO
      dx = Math.max(0, Math.min(ddx, max))
      apply(dx)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!armed) { return }
      armed = false
      if (!dragging) { return }
      const dt = Math.max(1, e.timeStamp - startT)
      const velocity = dx / dt
      const pastThreshold =
        dx > COMPLETE_PX ||
        dx > window.innerWidth * COMPLETE_RATIO ||
        velocity > FLICK_PX_MS
      if (pastThreshold) {
        // Slide the page fully off-screen, then navigate. The new route
        // replaces the now-invisible old one without a visual jump.
        endDrag(window.innerWidth, () => cbRef.current())
      } else {
        endDrag(0)
      }
    }

    const onTouchCancel = () => {
      armed = false
      if (dragging) endDrag(0)
    }

    el.addEventListener('touchstart',  onTouchStart,  { passive: true })
    el.addEventListener('touchmove',   onTouchMove,   { passive: true })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  return ref
}
