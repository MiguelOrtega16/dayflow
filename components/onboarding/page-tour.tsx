'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/analytics/posthog'
import { cn } from '@/lib/utils'

interface Props {
  /** Stable identifier for the page this tour describes. Used as the
   *  preferences key suffix (dismissed_tour_<tourId>) and the analytics
   *  property so we can see which tours users find sticky. */
  tourId: string
  /** Caller's auth id — needed for the preferences write on dismiss. */
  userId: string
  /** Short title shown in the banner header. */
  title: string
  /** 2–5 short bullet lines describing what's interactive on the page. */
  bullets: string[]
}

/**
 * One-shot per-page guidance banner. Renders inline at the top of the
 * surface it explains. Auto-fires `page_tour_shown` on mount, persists
 * the dismissal in `profile.preferences.dismissed_tour_<tourId>` so it
 * never re-shows after the user clicks the X.
 *
 * The gate (whether to render at all) lives in the parent page — this
 * component renders unconditionally when mounted, except for the local
 * optimistic-hide state after a click.
 */
export function PageTour({ tourId, userId, title, bullets }: Props) {
  const { t } = useI18n()
  const [hidden, setHidden] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    track('page_tour_shown', { tour_id: tourId })
  }, [tourId])

  async function handleDismiss() {
    if (dismissing) return
    setDismissing(true)
    track('page_tour_dismissed', { tour_id: tourId })
    setHidden(true)
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
      // If the write fails the banner re-appears on next visit — annoying
      // but harmless. Don't surface the error.
      console.warn('[page-tour] dismiss write failed', err)
    }
  }

  if (hidden) return null

  return (
    <div
      role="region"
      aria-label={title}
      className="shrink-0 border border-border rounded-2xl bg-primary/5 mb-4 sm:mb-5"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center mt-0.5">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mb-1">{title}</h3>
          <ul className="space-y-0.5 text-xs sm:text-sm text-muted-foreground">
            {bullets.map((b, i) => (
              <li key={i} className={cn('flex items-start gap-2 leading-snug')}>
                <span className="text-primary/60 shrink-0 mt-1">•</span>
                <span className="flex-1 min-w-0">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 -mr-1 -mt-1"
          aria-label={t('onboarding.pageTour.dismiss')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
