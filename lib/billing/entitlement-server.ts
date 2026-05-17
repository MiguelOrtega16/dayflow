import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Entitlement, Subscription } from '@/types'
import { EMPTY_ENTITLEMENT, computeEntitlement } from './entitlement'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { data, error } = await admin()
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.error('[entitlement] failed to read subscriptions', error)
    return EMPTY_ENTITLEMENT
  }
  return computeEntitlement((data ?? []) as Subscription[])
}

export class ProRequiredError extends Error {
  constructor() {
    super('PRO_REQUIRED')
    this.name = 'ProRequiredError'
  }
}

export async function requirePro(userId: string): Promise<Entitlement> {
  const ent = await getEntitlement(userId)
  if (!ent.isPro) throw new ProRequiredError()
  return ent
}
