'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entitlement, Subscription } from '@/types'
import { EMPTY_ENTITLEMENT, computeEntitlement } from './entitlement'

interface UseEntitlementResult {
  entitlement: Entitlement
  loading: boolean
}

export function useEntitlement(userId: string | null | undefined): UseEntitlementResult {
  const [entitlement, setEntitlement] = useState<Entitlement>(EMPTY_ENTITLEMENT)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!userId) {
      setEntitlement(EMPTY_ENTITLEMENT)
      setLoading(false)
      return
    }

    const supabase = createClient()
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
      if (!mounted) return
      setEntitlement(computeEntitlement((data ?? []) as Subscription[]))
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`subscriptions:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        load,
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { entitlement, loading }
}
