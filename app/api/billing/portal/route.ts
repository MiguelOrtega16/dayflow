import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { WEB_BILLING_ENABLED } from '@/lib/billing/products'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RawEvent {
  data?: { object?: { customer?: string } }
}

export async function POST() {
  // Web Stripe billing is gated off — guard the route alongside the UI.
  // Flip NEXT_PUBLIC_ENABLE_WEB_BILLING=1 to re-enable. See docs/prod-launch.md §2.
  if (!WEB_BILLING_ENABLED) {
    return NextResponse.json({ error: 'web billing disabled' }, { status: 403 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'billing not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // The Stripe customer ID is embedded in the raw webhook event we stored when
  // the subscription was created. Avoids needing a dedicated column or an
  // extra round-trip to Stripe's search API.
  const { data: rows } = await supabase
    .from('subscriptions')
    .select('raw')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .order('updated_at', { ascending: false })
    .limit(1)

  const customerId = (rows?.[0]?.raw as RawEvent | undefined)?.data?.object?.customer
  if (!customerId) {
    return NextResponse.json({ error: 'no stripe customer for user' }, { status: 404 })
  }

  const stripe = new Stripe(stripeKey)
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.appUrl}/dashboard/settings`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (err) {
    console.error('[billing/portal] stripe error', err)
    return NextResponse.json({ error: 'portal failed' }, { status: 500 })
  }
}
