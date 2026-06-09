'use client'

import { useEffect, useRef, useState } from 'react'
import { Crown, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { track } from '@/lib/analytics/posthog'

// ── Tuning knobs ────────────────────────────────────────────────────────────
// "Used the app for a while" = engaged, not just old. We require BOTH a minimum
// account age and a minimum number of created activities so a stale empty
// account never gets pitched.
const MIN_AGE_DAYS = 5
const MIN_ACTIVITIES = 8
// Re-surface at most once per cooldown window, and never more than MAX_SHOWS
// times total — after that we stop nagging for good.
const COOLDOWN_DAYS = 7
const MAX_SHOWS = 4
const DAY_MS = 86_400_000

interface NudgeState {
  count: number
  lastShownAt: string | null
}

interface Props {
  userId: string
  /** profiles.created_at — drives the account-age gate. */
  createdAt: string
  /** Server-known activity count — drives the engagement gate. */
  activityCount: number
}

/**
 * Soft, dismissible "upgrade to Pro" banner shown to engaged free users.
 *
 * Mounted by the dashboard root only when the onboarding banners aren't
 * showing (mutually exclusive). All real eligibility lives here so we don't
 * pitch Pro users or nag: gated on entitlement, account age + engagement, a
 * 7-day cooldown, and a lifetime cap. State is persisted in
 * profiles.preferences.pro_nudge, same mechanism as the setup checklist.
 *
 * Tapping the CTA opens the canonical Paywall (trigger 'usage_nudge'); on web
 * with Stripe gated off that paywall shows the Google Play badge instead.
 */
export function ProUpgradeNudge({ userId, createdAt, activityCount }: Props) {
  const { t } = useI18n()
  const { profile, setProfile } = useProfile()
  const { entitlement, loading } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()
  const [dismissed, setDismissed] = useState(false)
  const persistedRef = useRef(false)

  // Snapshot the persisted nudge state ONCE at mount. Eligibility is computed
  // against this snapshot, not the live preferences — otherwise writing
  // lastShownAt below would immediately fail the cooldown check and the banner
  // would vanish the instant it appeared.
  const [snapshot] = useState<NudgeState>(() => {
    const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
    const n = (prefs.pro_nudge as Partial<NudgeState> | undefined) ?? {}
    return { count: n.count ?? 0, lastShownAt: n.lastShownAt ?? null }
  })

  const ageDays = (Date.now() - new Date(createdAt).getTime()) / DAY_MS
  const cooldownPassed =
    !snapshot.lastShownAt ||
    Date.now() - new Date(snapshot.lastShownAt).getTime() >= COOLDOWN_DAYS * DAY_MS

  const eligible =
    !loading &&
    !entitlement.isPro &&
    ageDays >= MIN_AGE_DAYS &&
    activityCount >= MIN_ACTIVITIES &&
    snapshot.count < MAX_SHOWS &&
    cooldownPassed

  const show = eligible && !dismissed

  // Record the impression once: bump the lifetime count and stamp lastShownAt
  // so the cooldown starts ticking. Runs at most once per mount.
  useEffect(() => {
    if (!show || persistedRef.current) return
    persistedRef.current = true
    track('pro_nudge_shown', { impression: snapshot.count + 1 })
    void persistShown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  async function persistShown() {
    try {
      const supabase = createClient()
      const { data: row } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single()
      const prefs = (row?.preferences as Record<string, unknown> | null) ?? {}
      const next = {
        ...prefs,
        pro_nudge: {
          count: snapshot.count + 1,
          lastShownAt: new Date().toISOString(),
        },
      }
      await supabase.from('profiles').update({ preferences: next }).eq('id', userId)
      // Keep the shared profile cache in lockstep so a back-nav doesn't re-show.
      if (profile) setProfile({ ...profile, preferences: next })
    } catch {
      /* harmless — worst case the nudge reappears next load */
    }
  }

  function handleUpgrade() {
    track('pro_nudge_clicked')
    openPaywall('usage_nudge')
    setDismissed(true)
  }

  function handleDismiss() {
    track('pro_nudge_dismissed', { impression: snapshot.count + 1 })
    setDismissed(true)
  }

  if (!show) return null

  // Top inline banner — same placement contract as SetupChecklist (block
  // element, no fixed positioning) so it stacks above the calendar in the
  // dashboard's flex column without z-index/FAB conflicts.
  return (
    <div
      role="region"
      aria-label={t('billing.paywall.nudge.title')}
      className="shrink-0 border-b border-indigo-500/20 bg-indigo-500/5"
    >
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 max-w-6xl mx-auto">
        <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500">
          <Crown className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {t('billing.paywall.nudge.title')}
          </p>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2 sm:line-clamp-1">
            {t('billing.paywall.nudge.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleUpgrade}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          <Crown className="w-3.5 h-3.5" />
          {t('billing.paywall.nudge.cta')}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={t('billing.paywall.nudge.dismissAria')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
