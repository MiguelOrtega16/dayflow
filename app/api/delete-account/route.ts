import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const uid = user.id

  // Delete in FK-safe order:
  // 1. Notifications (reference activities + profiles)
  await admin.from('notifications').delete().eq('recipient_id', uid)
  // 2. Comments (reference activities + profiles)
  await admin.from('activity_comments').delete().eq('user_id', uid)
  // 3. Invitations (reference activities + profiles)
  await admin.from('activity_invitations').delete().or(`invitee_id.eq.${uid},inviter_id.eq.${uid}`)
  // 4. Calendar shares
  await admin.from('shared_calendars').delete().or(`owner_id.eq.${uid},shared_with_id.eq.${uid}`)
  // 5. Child (recurring) activities before parents to satisfy self-referential FK
  await admin.from('activities').delete().eq('user_id', uid).not('parent_activity_id', 'is', null)
  // 6. All remaining activities owned by user
  await admin.from('activities').delete().eq('user_id', uid)
  // 7. Goals (activities referencing them are already gone)
  await admin.from('goals').delete().eq('user_id', uid)
  // 8. Profile row (includes fcm_token column)
  await admin.from('profiles').delete().eq('id', uid)
  // 9. Auth user — point of no return
  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
