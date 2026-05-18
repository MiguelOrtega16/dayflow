import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { STRIPE_PRICE_IDS } from '@/lib/billing/products'
import { env } from '@/lib/env'
import type { BillingProductId } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_PRODUCTS: BillingProductId[] = ['pro_monthly', 'pro_annual', 'pro_lifetime']

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'billing not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { productId?: BillingProductId } = {}
  try {
    body = (await request.json()) as { productId?: BillingProductId }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const productId = body.productId
  if (!productId || !VALID_PRODUCTS.includes(productId)) {
    return NextResponse.json({ error: 'invalid product' }, { status: 400 })
  }

  const priceId = STRIPE_PRICE_IDS[productId]
  if (!priceId) {
    return NextResponse.json({ error: 'price not configured' }, { status: 500 })
  }

  const stripe = new Stripe(stripeKey)
  const isLifetime = productId === 'pro_lifetime'
  const successUrl = `${env.appUrl}/dashboard/settings?billing=success&product=${productId}`
  const cancelUrl = `${env.appUrl}/dashboard/settings?billing=canceled`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      // Set user_id on both the session and the underlying subscription so the
      // webhook can resolve the Supabase user regardless of event type.
      metadata: isLifetime
        ? { user_id: user.id, product_id: productId }
        : { user_id: user.id },
      ...(isLifetime
        ? {}
        : {
            subscription_data: {
              metadata: { user_id: user.id },
              // Trial duration is configured on the Stripe price itself (3-day
              // trial on the Annual price), so we don't pass trial_period_days.
            },
          }),
    })

    if (!session.url) {
      return NextResponse.json({ error: 'no checkout url' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[billing/checkout] stripe error', err)
    return NextResponse.json({ error: 'checkout failed' }, { status: 500 })
  }
}
