'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Plus, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { initPushNotifications } from '@/lib/push-notifications'
import { track } from '@/lib/analytics/posthog'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
  /** Server-known activity count > 0 — saves a fetch and avoids the empty
   *  state on first paint. The component still watches its own auth state
   *  for the reminders step. */
  hasActivities: boolean
  /** Server-known push token presence (web_push_subscription or fcm_token).
   *  Used as the initial hint; client refines from Notification.permission
   *  on mount to catch the case where the user granted in another tab. */
  hasPushSubscription: boolean
}

type ReminderState = 'pending' | 'granted' | 'denied' | 'unsupported' | 'requesting'

export function SetupChecklist({ userId, hasActivities, hasPushSubscription }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [dismissing, setDismissing] = useState(false)
  const [hidden, setHidden]         = useState(false)
  // Tracks activities created in this tab after the server snapshot. The
  // server-side hasActivities is point-in-time; without this the row would
  // stay until a full reload.
  const [createdInSession, setCreatedInSession] = useState(false)
  const [reminderState, setReminderState] = useState<ReminderState>(() => {
    if (hasPushSubscription) return 'granted'
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied')  return 'denied'
    return 'pending'
  })

  useEffect(() => {
    const onCreated = () => setCreatedInSession(true)
    window.addEventListener('dayflow:activity-created', onCreated)
    return () => window.removeEventListener('dayflow:activity-created', onCreated)
  }, [])

  // Sync from the browser API in case the user granted in another tab and
  // didn't refresh — keeps the step state honest without a full reload.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const sync = () => {
      const perm = Notification.permission
      setReminderState(prev =>
        prev === 'requesting' ? prev
          : perm === 'granted' ? 'granted'
          : perm === 'denied'  ? 'denied'
          : 'pending',
      )
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const firstActivityDone = hasActivities || createdInSession
  const remindersDone     = reminderState === 'granted'

  // Each visible step is either pending or actively completed. Hidden when
  // already done (we don't want to gloat) OR when the step doesn't apply
  // (e.g., notifications unsupported in this browser).
  const showFirstActivity = !firstActivityDone
  const showReminders     = !remindersDone && reminderState !== 'unsupported'

  const visibleStepCount = (showFirstActivity ? 1 : 0) + (showReminders ? 1 : 0)
  const allDoneEver = !showFirstActivity && !showReminders

  useEffect(() => {
    if (visibleStepCount > 0) track('setup_checklist_shown', { steps: visibleStepCount })
  }, [])

  // Soft-completion: if all visible steps drop to zero while the card is
  // mounted (e.g., user just enabled reminders), persist the dismissed flag
  // so reloading doesn't show it again, and fade the card out.
  useEffect(() => {
    if (!allDoneEver || hidden) return
    track('setup_checklist_completed')
    void markDismissed()
    const t = setTimeout(() => setHidden(true), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDoneEver, hidden])

  async function markDismissed() {
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
          dismissed_setup_checklist: true,
          dismissed_setup_checklist_at: new Date().toISOString(),
        },
      })
      .eq('id', userId)
  }

  async function handleDismiss() {
    if (dismissing) return
    setDismissing(true)
    track('setup_checklist_dismissed', { remaining_steps: visibleStepCount })
    setHidden(true)
    try { await markDismissed() } catch { /* harmless — worst case it reappears next load */ }
  }

  function handleFirstActivity() {
    track('setup_checklist_step_clicked', { step: 'first_activity' })
    // The FAB lives at the bottom-right of the calendar view and dispatches
    // dayflow:navigate on click — but there's no public "open add modal"
    // event yet. Cheapest robust path: dispatch a focus event the calendar
    // listens for, OR just navigate to the dashboard root so the empty-state
    // CTA is visible. Going with router.refresh to reset, then we rely on
    // the user noticing the highlighted FAB. (Future: wire a custom event.)
    window.dispatchEvent(new CustomEvent('dayflow:open-add-activity'))
  }

  async function handleReminders() {
    if (reminderState === 'requesting' || reminderState === 'granted') return
    track('setup_checklist_step_clicked', { step: 'reminders' })

    // Denied means the browser won't re-prompt — surface guidance instead.
    if (reminderState === 'denied') {
      router.push('/dashboard/settings/notifications/troubleshoot')
      return
    }

    setReminderState('requesting')
    try {
      await initPushNotifications(userId)
      // Read the post-request state authoritatively from the browser.
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default'
      setReminderState(perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'pending')
    } catch (err) {
      console.error('[setup-checklist] reminder request failed', err)
      setReminderState('pending')
    }
  }

  if (hidden || visibleStepCount === 0) return null

  return (
    <div
      className={cn(
        'fixed z-30 transition-opacity duration-500',
        allDoneEver ? 'opacity-0' : 'opacity-100',
        'left-2 right-2 sm:left-auto sm:right-4 sm:max-w-sm',
      )}
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('onboarding.setupChecklist.title')}
          </h3>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
            className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            aria-label={t('onboarding.setupChecklist.dismiss')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <ul className="p-2 space-y-1">
          {showFirstActivity && (
            <ChecklistRow
              icon={<Plus className="w-4 h-4" />}
              label={t('onboarding.setupChecklist.steps.firstActivity.label')}
              cta={t('onboarding.setupChecklist.steps.firstActivity.cta')}
              onClick={handleFirstActivity}
            />
          )}
          {showReminders && (
            <ChecklistRow
              icon={<Bell className="w-4 h-4" />}
              label={t('onboarding.setupChecklist.steps.reminders.label')}
              cta={
                reminderState === 'denied'
                  ? t('onboarding.setupChecklist.steps.reminders.denied')
                  : reminderState === 'requesting'
                    ? '…'
                    : t('onboarding.setupChecklist.steps.reminders.cta')
              }
              muted={reminderState === 'denied'}
              onClick={handleReminders}
            />
          )}
        </ul>
      </div>
    </div>
  )
}

function ChecklistRow({
  icon, label, cta, onClick, muted = false,
}: {
  icon: React.ReactNode
  label: string
  cta: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted transition-colors text-left"
      >
        <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{label}</span>
        <span
          className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0',
            muted
              ? 'text-muted-foreground bg-muted'
              : 'text-primary bg-primary/10',
          )}
        >
          {cta}
        </span>
      </button>
    </li>
  )
}
