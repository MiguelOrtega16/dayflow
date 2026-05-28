'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Paywall, type PaywallTrigger } from './paywall'
import { track } from '@/lib/analytics/posthog'
import { pushAdSuppress } from '@/lib/ad-suppress'

interface PaywallContextValue {
  open: (trigger?: PaywallTrigger) => void
  close: () => void
}

const PaywallContext = createContext<PaywallContextValue>({
  open: () => {},
  close: () => {},
})

export function usePaywall() {
  return useContext(PaywallContext)
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [activeTrigger, setActiveTrigger] = useState<PaywallTrigger | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) setUserId(user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const open = useCallback((trigger?: PaywallTrigger) => {
    const t = trigger ?? 'generic'
    setActiveTrigger(t)
    track('paywall_viewed', { trigger: t })
  }, [])

  const close = useCallback(() => {
    setActiveTrigger(prev => {
      if (prev) track('paywall_dismissed', { trigger: prev })
      return null
    })
  }, [])

  // Native AdMob banner sits above the WebView and would otherwise cover
  // the paywall's bottom CTAs ("Restore purchases" / price disclaimer).
  // Suppress while the modal is open.
  useEffect(() => {
    if (!activeTrigger) return
    return pushAdSuppress('paywall')
  }, [activeTrigger])

  return (
    <PaywallContext.Provider value={{ open, close }}>
      {children}
      {activeTrigger && (
        <Paywall userId={userId} trigger={activeTrigger} onClose={close} />
      )}
    </PaywallContext.Provider>
  )
}
