import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client for billing webhooks. Bypasses RLS — only used server-side.
export function billingAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Billing admin client misconfigured: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing',
    )
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}
