'use client'

import { useEffect, useId, useState } from 'react'
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
  // Supabase reuses channels by name. Multiple components calling useEntitlement
  // with the same userId (sidebar + people page, etc.) need distinct channel
  // names or the second .on() throws "cannot add callbacks after subscribe()".
  const instanceId = useId()

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
      .channel(`subscriptions:${userId}:${instanceId}`)
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
  }, [userId, instanceId])

  return { entitlement, loading }
}
