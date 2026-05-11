import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { subscription } = await request.json()
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'missing subscription' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await supabase
    .from('profiles')
    .update({ web_push_subscription: subscription })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
