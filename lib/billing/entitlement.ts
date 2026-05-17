import type { Entitlement, Subscription } from '@/types'

export const EMPTY_ENTITLEMENT: Entitlement = {
  isPro: false,
  isInTrial: false,
  plan: null,
  platform: null,
  expiresAt: null,
  cancelAtPeriodEnd: false,
}

// Determine the user's effective entitlement from all their subscription rows.
// A user may have rows from both Stripe (web) and RevenueCat (Android); we OR them
// together and pick the most valuable one (lifetime > latest expiry).
export function computeEntitlement(rows: Subscription[]): Entitlement {
  const now = Date.now()
  const active = rows.filter((r) => {
    if (r.product_id === 'pro_lifetime' && r.status === 'active') return true
    if (r.status !== 'active' && r.status !== 'trialing') return false
    if (r.current_period_end && new Date(r.current_period_end).getTime() <= now) return false
    return true
  })

  if (active.length === 0) return EMPTY_ENTITLEMENT

  active.sort((a, b) => {
    if (a.product_id === 'pro_lifetime' && b.product_id !== 'pro_lifetime') return -1
    if (b.product_id === 'pro_lifetime' && a.product_id !== 'pro_lifetime') return 1
    const ae = a.current_period_end ? new Date(a.current_period_end).getTime() : Number.POSITIVE_INFINITY
    const be = b.current_period_end ? new Date(b.current_period_end).getTime() : Number.POSITIVE_INFINITY
    return be - ae
  })

  const best = active[0]
  return {
    isPro: true,
    isInTrial: best.status === 'trialing',
    plan: best.product_id,
    platform: best.platform,
    expiresAt: best.current_period_end,
    cancelAtPeriodEnd: best.cancel_at_period_end,
  }
}
