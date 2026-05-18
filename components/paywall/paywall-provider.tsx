'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Paywall, type PaywallTrigger } from './paywall'

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
    setActiveTrigger(trigger ?? 'generic')
  }, [])

  const close = useCallback(() => setActiveTrigger(null), [])

  return (
    <PaywallContext.Provider value={{ open, close }}>
      {children}
      {activeTrigger && (
        <Paywall userId={userId} trigger={activeTrigger} onClose={close} />
      )}
    </PaywallContext.Provider>
  )
}
