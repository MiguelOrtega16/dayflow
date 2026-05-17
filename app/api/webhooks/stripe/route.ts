import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { billingAdminClient } from '@/lib/billing/supabase-admin'
import { productIdFromStripePrice } from '@/lib/billing/products'
import type { BillingProductId, SubscriptionStatus } from '@/types'

export const runtime = 'nodejs'
// Stripe needs the raw body for signature verification — never let Next parse it.
export const dynamic = 'force-dynamic'

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'past_due',
  paused: 'paused',
  incomplete: 'past_due',
  incomplete_expired: 'expired',
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=') as [string, string]),
  )
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  // Reject replays older than 5 minutes
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface UpsertArgs {
  userId: string
  providerSubscriptionId: string
  productId: BillingProductId
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  raw: unknown
}

async function upsertSubscription(args: UpsertArgs) {
  const supabase = billingAdminClient()
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: args.userId,
      provider: 'stripe',
      provider_subscription_id: args.providerSubscriptionId,
      product_id: args.productId,
      status: args.status,
      platform: 'web',
      current_period_end: args.currentPeriodEnd,
      cancel_at_period_end: args.cancelAtPeriodEnd,
      trial_end: args.trialEnd,
      raw: args.raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider,provider_subscription_id' },
  )
  if (error) console.error('[stripe webhook] upsert failed', error)
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody)
  const type: string = event.type
  const obj = event.data?.object ?? {}

  try {
    if (type.startsWith('customer.subscription.')) {
      // Subscription mode (monthly / annual)
      const userId = obj.metadata?.user_id
      const priceId = obj.items?.data?.[0]?.price?.id
      const productId = priceId ? productIdFromStripePrice(priceId) : null
      if (!userId || !productId) {
        console.warn('[stripe webhook] missing user_id or price mapping', { userId, priceId })
        return NextResponse.json({ received: true, skipped: true })
      }

      const status =
        type === 'customer.subscription.deleted'
          ? ('canceled' as SubscriptionStatus)
          : (STRIPE_STATUS_MAP[obj.status] ?? 'expired')

      await upsertSubscription({
        userId,
        providerSubscriptionId: obj.id,
        productId,
        status,
        currentPeriodEnd: obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        trialEnd: obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : null,
        raw: event,
      })
    } else if (type === 'checkout.session.completed' && obj.mode === 'payment') {
      // One-time payment (lifetime)
      const userId = obj.metadata?.user_id ?? obj.client_reference_id
      // For payment mode the session doesn't include line items inline; the price is in metadata
      const productId = (obj.metadata?.product_id as BillingProductId | undefined) ?? null
      if (!userId || productId !== 'pro_lifetime') {
        console.warn('[stripe webhook] payment session not a known lifetime purchase', { userId, productId })
        return NextResponse.json({ received: true, skipped: true })
      }
      await upsertSubscription({
        userId,
        providerSubscriptionId: obj.id,
        productId: 'pro_lifetime',
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        raw: event,
      })
    }
  } catch (err) {
    console.error('[stripe webhook] handler error', err)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
