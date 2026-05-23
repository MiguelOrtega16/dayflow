'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { track } from '@/lib/analytics/posthog'
import { cn } from '@/lib/utils'

export interface ChipTourStep {
  /** CSS selector used to locate the target chip in the DOM. Resolved per
   *  step via document.querySelector so the chip can re-render between
   *  steps (e.g. a value chip updating as the user advances). */
  targetSelector: string
  title: string
  body: string
}

interface Props {
  userId: string
  /** Stable identifier persisted as `dismissed_tour_<tourId>` so the tour
   *  fires once per user. */
  tourId: string
  steps: ChipTourStep[]
  onDone: () => void
}

interface Rect { top: number; left: number; width: number; height: number }

/**
 * One-shot sequential spotlight tour for chip rails. Highlights each chip
 * via a transparent rectangle with a big surrounding box-shadow, drops a
 * tooltip below (or above when there's no room), and advances via a
 * "Next" button. Persists dismissal in profile.preferences so it never
 * re-fires for the same user.
 *
 * Targets are looked up via document.querySelector so the host just needs
 * to tag chips with `data-tour="<key>"`. Re-measures on resize / scroll /
 * orientation change so a rotating phone or a virtual-keyboard reflow
 * doesn't strand the spotlight off-screen.
 */
export function ChipTour({ userId, tourId, steps, onDone }: Props) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [rect, setRect]   = useState<Rect | null>(null)
  const step = steps[index]

  useEffect(() => {
    track('chip_tour_shown', { tour_id: tourId })
  }, [tourId])

  // Measure the target each time the step changes — and on resize / scroll
  // so the spotlight tracks the chip if the layout shifts mid-tour.
  useLayoutEffect(() => {
    if (!step) return
    const measure = () => {
      const el = document.querySelector(step.targetSelector)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step?.targetSelector, index])

  async function persistDismissed() {
    try {
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single()
      const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
      await supabase
        .from('profiles')
        .update({
          preferences: {
            ...prefs,
            [`dismissed_tour_${tourId}`]: true,
            [`dismissed_tour_${tourId}_at`]: new Date().toISOString(),
          },
        })
        .eq('id', userId)
    } catch (err) {
      // Best-effort: a failed write just means the tour re-shows next time.
      console.warn('[chip-tour] dismiss write failed', err)
    }
  }

  function handleNext() {
    if (index < steps.length - 1) {
      setIndex(i => i + 1)
      return
    }
    track('chip_tour_completed', { tour_id: tourId })
    persistDismissed()
    onDone()
  }

  function handleSkip() {
    track('chip_tour_skipped', { tour_id: tourId, step_index: index })
    persistDismissed()
    onDone()
  }

  if (!step) return null

  // While the chip can't be located yet, render a plain backdrop without a
  // spotlight so the tour still functions if the rail hasn't laid out.
  const padding = 6
  const spotlight = rect ? {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  } : null

  // Tooltip placement: below the chip when there's room, otherwise above.
  // The threshold (220 px) is enough for a 3-line body + button row on a
  // small phone viewport.
  const TOOLTIP_MIN_BELOW = 220
  const placeBelow = !spotlight ||
    (window.innerHeight - (spotlight.top + spotlight.height)) > TOOLTIP_MIN_BELOW

  const tooltipStyle: React.CSSProperties = spotlight ? {
    position: 'fixed',
    left: 12,
    right: 12,
    ...(placeBelow
      ? { top: Math.min(spotlight.top + spotlight.height + 12, window.innerHeight - 240) }
      : { top: Math.max(spotlight.top - 12 - 200, 12) }),
  } : { position: 'fixed', left: 12, right: 12, bottom: 24 }

  return (
    <div className="fixed inset-0 z-[55]" aria-modal="true" role="dialog">
      {/* Dim everything outside the spotlight. The huge box-shadow on the
          transparent rectangle creates the cutout — no SVG mask needed. */}
      {spotlight ? (
        <div
          className="pointer-events-none rounded-xl transition-all duration-200"
          style={{
            position: 'fixed',
            top:    spotlight.top,
            left:   spotlight.left,
            width:  spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* Tooltip card */}
      <div
        className={cn(
          'bg-popover border border-border rounded-2xl shadow-2xl p-4 max-w-md mx-auto',
        )}
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="font-semibold text-sm">{step.title}</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {index + 1} / {steps.length}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-snug mb-3">{step.body}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            {t('onboarding.chipTour.skip')}
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {index === steps.length - 1
              ? t('onboarding.chipTour.done')
              : t('onboarding.chipTour.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
