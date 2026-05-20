import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingAdminClient } from '@/lib/billing/supabase-admin'
import { generateRecurrenceDates } from '@/lib/recurrence'
import { getStarterPack, resolveTemplates } from '@/lib/onboarding/starter-packs'
import { getMessage } from '@/lib/i18n/messages'
import { LOCALES, type Locale } from '@/lib/i18n/types'
import type { Activity, RecurrenceConfig, RecurrenceType } from '@/types'
import { addDays, format } from 'date-fns'

// Templates and starter packs use a 1-month rolling cap so a brand-new user
// doesn't end up with ~500 ghost activities on their calendar. The hard cap
// in lib/recurrence.ts still applies as a safety net; this just lowers the
// default end date.
const TEMPLATE_RECURRENCE_DAYS = 30

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirrors the picker's mapping. Kept here so the route is self-contained and
// the client can't pass through unexpected recurrence patterns.
function pickRecurrence(days: number[], endDate: string): { type: RecurrenceType; config: RecurrenceConfig } {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return { type: 'daily',    config: { interval: 1, end_date: endDate } }
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return { type: 'weekdays', config: { end_date: endDate } }
  return { type: 'custom', config: { days_of_week: sorted, end_date: endDate } }
}

interface InsertPackBody {
  pack_id?: string
  locale?: string
}

export async function POST(request: Request) {
  let body: InsertPackBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const pack = body.pack_id ? getStarterPack(body.pack_id) : null
  if (!pack) {
    return NextResponse.json({ error: 'invalid_pack' }, { status: 400 })
  }
  const locale: Locale = (LOCALES as readonly string[]).includes(body.locale ?? '')
    ? (body.locale as Locale)
    : 'es'

  // Authenticate via the user's session cookies (NOT service role — we need
  // to confirm the caller is who they claim to be before we elevate).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Defense in depth: only insert a starter pack for users who haven't already
  // either added activities or dismissed the picker. Prevents this endpoint
  // from being used to spam a user's calendar (since it bypasses RLS).
  const admin = billingAdminClient()
  const [{ data: profile }, { count: activityCount }] = await Promise.all([
    admin.from('profiles').select('preferences').eq('id', user.id).single(),
    admin.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id).limit(1),
  ])

  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? {}
  if (prefs.dismissed_starter_picker === true) {
    return NextResponse.json({ error: 'already_dismissed' }, { status: 409 })
  }
  if ((activityCount ?? 0) > 0) {
    return NextResponse.json({ error: 'not_empty_calendar' }, { status: 409 })
  }

  // Build the full row list (parents + children) before any write so an error
  // mid-loop doesn't leave the user with a partial pack.
  const today = format(new Date(), 'yyyy-MM-dd')
  const endDate = format(addDays(new Date(), TEMPLATE_RECURRENCE_DAYS), 'yyyy-MM-dd')
  const rows: Array<Record<string, unknown>> = []
  const templates = resolveTemplates(pack)

  for (const template of templates) {
    const title = getMessage(locale, `templates.${template.id}.name`) ?? template.id
    const description = getMessage(locale, `templates.${template.id}.description`) ?? null
    const phrase = getMessage(locale, `templates.${template.id}.phrase`) ?? null
    const recurrence = pickRecurrence(template.defaults.days_of_week, endDate)

    for (const time of template.defaults.reminder_times) {
      const base: Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'profile' | 'goal'> = {
        user_id:               user.id,
        title,
        description,
        date:                  today,
        status:                'todo',
        priority:              'medium',
        category:              template.defaults.activity_category,
        goal_id:               null,
        tags:                  [],
        color:                 null,
        emoji:                 template.emoji,
        start_time:            time,
        end_time:              null,
        recurrence_type:       recurrence.type,
        recurrence_config:     recurrence.config,
        reminder_offsets:      [0],
        reminder_phrase:       phrase,
        parent_activity_id:    null,
        is_public:             false,
        notes:                 null,
        completion_percentage: 0,
      }

      const instances = generateRecurrenceDates(base.date, recurrence.type, recurrence.config, base.start_time ?? null)

      // First instance is the parent; we insert it separately so we can grab
      // its id and stamp the children with parent_activity_id.
      rows.push({ ...base, __isParent: true, __siblings: instances.slice(1) })
    }
  }

  let insertedCount = 0
  try {
    for (const parentRow of rows) {
      const { __isParent: _isParent, __siblings, ...parentPayload } = parentRow as
        { __isParent: boolean; __siblings: { date: string; start_time?: string }[] } & Record<string, unknown>

      const { data: parent, error: parentErr } = await admin
        .from('activities')
        .insert(parentPayload)
        .select('id')
        .single()

      if (parentErr) throw parentErr
      insertedCount++

      if (__siblings.length > 0) {
        const childRows = __siblings.map(inst => ({
          ...parentPayload,
          date: inst.date,
          ...(inst.start_time ? { start_time: inst.start_time } : {}),
          parent_activity_id: parent.id,
        }))
        const { error: childErr } = await admin.from('activities').insert(childRows)
        if (childErr) throw childErr
        insertedCount += childRows.length
      }
    }

    await admin
      .from('profiles')
      .update({
        preferences: {
          ...prefs,
          dismissed_starter_picker: true,
          dismissed_starter_picker_at: new Date().toISOString(),
        },
      })
      .eq('id', user.id)
  } catch (err) {
    console.error('[starter-pack insert] failed', err)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, activity_count: insertedCount, pack_id: pack.id })
}
