import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client for billing webhooks. Bypasses RLS — only used server-side.
export function billingAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
