import type { BillingProductId } from '@/types'

// Anchor prices (USD). Regional pricing is set in Play Console / Stripe — never hardcoded here.
// These are the fallback strings shown only if the store SDK / API hasn't returned localized prices yet.
export const ANCHOR_PRICE_USD: Record<BillingProductId, string> = {
  pro_monthly: '$1.99',
  pro_annual: '$12.99',
  pro_lifetime: '$20.00',
}

// Play Console product IDs (set these to the exact SKUs you create on Play Console).
export const PLAY_PRODUCT_IDS: Record<BillingProductId, string> = {
  pro_monthly: 'dayflow_pro_monthly',
  pro_annual: 'dayflow_pro_annual',
  pro_lifetime: 'dayflow_pro_lifetime',
}

// RevenueCat entitlement identifier — single entitlement shared by all three SKUs.
export const RC_ENTITLEMENT_ID = 'pro'

// Stripe price IDs come from env (different keys in dev vs prod, different per SKU).
// Server-only — never expose secret keys, but the price IDs themselves are safe in the client bundle.
export const STRIPE_PRICE_IDS: Record<BillingProductId, string> = {
  pro_monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? '',
  pro_annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL ?? '',
  pro_lifetime: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME ?? '',
}

export const TRIAL_DAYS_ANNUAL = 3

export function productIdFromStripePrice(priceId: string): BillingProductId | null {
  const entry = (Object.entries(STRIPE_PRICE_IDS) as [BillingProductId, string][])
    .find(([, id]) => id === priceId)
  return entry?.[0] ?? null
}

export function productIdFromPlaySku(sku: string): BillingProductId | null {
  // Play subscription SKUs come through as `{product_id}:{base_plan_id}` (e.g.
  // `dayflow_pro_monthly:monthly`). One-time products have no suffix. Strip the
  // base-plan part before matching so both shapes resolve correctly.
  const baseSku = sku.split(':')[0]
  const entry = (Object.entries(PLAY_PRODUCT_IDS) as [BillingProductId, string][])
    .find(([, id]) => id === baseSku)
  return entry?.[0] ?? null
}
