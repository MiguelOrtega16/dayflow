import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { billingAdminClient } from '@/lib/billing/supabase-admin'
import { productIdFromPlaySku } from '@/lib/billing/products'
import type { BillingPlatform, BillingProductId, SubscriptionStatus } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RevenueCat event types we care about. Reference:
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
const RC_STATUS_MAP: Record<string, SubscriptionStatus> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  PRODUCT_CHANGE: 'active',
  UNCANCELLATION: 'active',
  NON_RENEWING_PURCHASE: 'active', // lifetime
  CANCELLATION: 'canceled',
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'past_due',
  SUBSCRIPTION_PAUSED: 'paused',
}

const RC_STORE_MAP: Record<string, BillingPlatform> = {
  PLAY_STORE: 'android',
  APP_STORE: 'ios',
  AMAZON: 'android',
  MAC_APP_STORE: 'ios',
  PROMOTIONAL: 'android',
  STRIPE: 'web',
}

function verifyRcAuth(header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[rc webhook] REVENUECAT_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  if (!verifyRcAuth(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const event = payload?.event
  if (!event?.type) {
    return NextResponse.json({ error: 'missing event' }, { status: 400 })
  }

  const status = RC_STATUS_MAP[event.type]
  if (!status) {
    // Event we don't track (e.g. TEST, TRANSFER); accept and ignore
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const userId: string | undefined = event.app_user_id
  const productSku: string | undefined = event.product_id
  const productId: BillingProductId | null = productSku ? productIdFromPlaySku(productSku) : null

  if (!userId || !productId) {
    console.warn('[rc webhook] missing user or product mapping', { userId, productSku })
    return NextResponse.json({ received: true, skipped: true })
  }

  const platform = RC_STORE_MAP[event.store] ?? 'android'
  const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null
  const trialEnd =
    event.period_type === 'TRIAL' && event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null
  const finalStatus: SubscriptionStatus =
    event.period_type === 'TRIAL' && status === 'active' ? 'trialing' : status

  const supabase = billingAdminClient()
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      provider: 'revenuecat',
      provider_subscription_id: event.original_transaction_id ?? `${userId}:${productSku}`,
      product_id: productId,
      status: finalStatus,
      platform,
      current_period_end: productId === 'pro_lifetime' ? null : periodEnd,
      cancel_at_period_end: Boolean(event.cancel_reason) && finalStatus === 'active',
      trial_end: trialEnd,
      raw: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider,provider_subscription_id' },
  )
  if (error) {
    console.error('[rc webhook] upsert failed', error)
    return NextResponse.json({ error: 'upsert failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
