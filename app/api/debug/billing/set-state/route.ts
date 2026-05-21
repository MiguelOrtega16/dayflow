import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingAdminClient } from '@/lib/billing/supabase-admin'
import { addDays } from 'date-fns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Dev-only billing state shortcuts. Lets a tester force their own user into
 * any of the entitlement-relevant subscription shapes without orchestrating
 * a full Stripe / RevenueCat checkout. Always operates on the calling
 * user — there is no userId override, on purpose, to keep this from being
 * weaponized if it ever escapes the env gate.
 *
 * The gate is off by default. To enable in a dev environment:
 *   BILLING_DEBUG_ENABLED=1
 * in `.env.local`. NODE_ENV=development alone also unlocks it so the
 * happy path of running `next dev` "just works" without extra setup.
 */

const STATES = [
  'free',
  'pro_monthly_active',
  'pro_annual_trialing',
  'pro_annual_active',
  'pro_lifetime',
  'canceling',
  'past_due',
  'expired',
  'rc_monthly_active',
] as const
type State = typeof STATES[number]

interface SetStateBody {
  state?: string
}

function isEnabled(): boolean {
  return process.env.BILLING_DEBUG_ENABLED === '1' || process.env.NODE_ENV === 'development'
}

// Customer ID to embed in the synthetic `raw` payload so the
// /api/billing/portal endpoint can extract it the same way it does for
// real webhook-sourced rows. Set STRIPE_DEBUG_CUSTOMER_ID in .env.local
// to a real test-mode customer (e.g. cus_test_abc...) to make the manage
// button actually open the portal. Otherwise we use a clearly-fake id so
// the portal endpoint at least returns a real Stripe error ("No such
// customer") instead of our generic 404, which confirms the wiring.
function debugStripeCustomerId(): string {
  return process.env.STRIPE_DEBUG_CUSTOMER_ID ?? 'cus_debug_placeholder'
}

// Build a minimal `raw` field that mimics the shape of a Stripe webhook
// event payload — specifically the path the portal route reads
// (raw.data.object.customer). Anything else can stay empty.
function debugRaw() {
  return {
    debug: true,
    data: { object: { customer: debugStripeCustomerId() } },
  }
}

// Build the row payload for a given state. user_id is filled in by the
// caller. Returns null for `free` which is just a delete-and-stop.
function buildRow(state: State): Record<string, unknown> | null {
  const now = new Date()
  const in30d  = addDays(now, 30).toISOString()
  const in365d = addDays(now, 365).toISOString()
  const yesterday = addDays(now, -1).toISOString()
  // Synthetic provider id so the unique (provider, provider_subscription_id)
  // constraint is satisfied and these debug rows are easy to spot in the DB.
  const fakeId = (prefix: string) => `debug_${prefix}_${Date.now()}`
  // Stripe-provider rows get a synthetic raw payload so the manage button
  // can reach Stripe; RC rows skip this since the portal route only looks
  // at Stripe rows anyway.
  const stripeBase = (subId: string) => ({
    provider: 'stripe' as const,
    platform: 'web' as const,
    provider_subscription_id: subId,
    raw: debugRaw(),
  })

  switch (state) {
    case 'free':
      return null

    case 'pro_monthly_active':
      return {
        ...stripeBase(fakeId('mo')),
        product_id: 'pro_monthly',
        status: 'active',
        current_period_end: in30d,
        cancel_at_period_end: false,
        trial_end: null,
      }

    case 'pro_annual_trialing':
      return {
        ...stripeBase(fakeId('an_tr')),
        product_id: 'pro_annual',
        status: 'trialing',
        current_period_end: in365d,
        cancel_at_period_end: false,
        trial_end: addDays(now, 3).toISOString(),
      }

    case 'pro_annual_active':
      return {
        ...stripeBase(fakeId('an')),
        product_id: 'pro_annual',
        status: 'active',
        current_period_end: in365d,
        cancel_at_period_end: false,
        trial_end: null,
      }

    case 'pro_lifetime':
      return {
        ...stripeBase(fakeId('life')),
        product_id: 'pro_lifetime',
        status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        trial_end: null,
      }

    case 'canceling':
      return {
        ...stripeBase(fakeId('cancel')),
        product_id: 'pro_monthly',
        status: 'active',
        current_period_end: in30d,
        cancel_at_period_end: true,
        trial_end: null,
      }

    case 'past_due':
      return {
        ...stripeBase(fakeId('pd')),
        product_id: 'pro_monthly',
        status: 'past_due',
        current_period_end: in30d,
        cancel_at_period_end: false,
        trial_end: null,
      }

    case 'expired':
      // canceled status + a past period_end is the shape webhooks produce
      // after a sub naturally winds down. computeEntitlement filters these
      // out so the user falls back to free.
      return {
        ...stripeBase(fakeId('exp')),
        product_id: 'pro_monthly',
        status: 'canceled',
        current_period_end: yesterday,
        cancel_at_period_end: false,
        trial_end: null,
      }

    case 'rc_monthly_active':
      return {
        provider: 'revenuecat', platform: 'android',
        provider_subscription_id: fakeId('rc_mo'),
        product_id: 'pro_monthly',
        status: 'active',
        current_period_end: in30d,
        cancel_at_period_end: false,
        trial_end: null,
      }
  }
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'debug_disabled' }, { status: 404 })
  }

  let body: SetStateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const state = body.state as State | undefined
  if (!state || !(STATES as readonly string[]).includes(state)) {
    return NextResponse.json({ error: 'invalid_state', valid: STATES }, { status: 400 })
  }

  // Authenticate via the user's session — we never target other users.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const admin = billingAdminClient()

  // Wipe existing subscription rows for this user so the desired state is
  // the only thing computeEntitlement sees. Avoids accidentally compounding
  // a Pro state on top of an older trialing row.
  const { error: delErr } = await admin
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
  if (delErr) {
    return NextResponse.json({ error: 'delete_failed', detail: delErr.message }, { status: 500 })
  }

  const row = buildRow(state)
  if (row) {
    const { error: insErr } = await admin
      .from('subscriptions')
      .insert({ ...row, user_id: user.id })
    if (insErr) {
      return NextResponse.json({ error: 'insert_failed', detail: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, state, user_id: user.id })
}
