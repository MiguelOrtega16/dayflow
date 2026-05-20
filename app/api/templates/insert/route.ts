import { NextResponse } from 'next/server'
import { addDays, format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { billingAdminClient } from '@/lib/billing/supabase-admin'
import { generateRecurrenceDates } from '@/lib/recurrence'
import { getTemplate } from '@/lib/activity-templates'
import { getMessage } from '@/lib/i18n/messages'
import { LOCALES, type Locale } from '@/lib/i18n/types'
import type { Activity, RecurrenceConfig, RecurrenceType } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same cap the client used to use. Free users would otherwise hit the
// activities-RLS recurrence gate, so this route inserts via service role.
const TEMPLATE_RECURRENCE_DAYS = 30
const MAX_REMINDER_TIMES = 8
const MAX_PHRASE_LEN = 240
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

function pickRecurrence(days: number[], endDate: string): { type: RecurrenceType; config: RecurrenceConfig } {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return { type: 'daily',    config: { interval: 1, end_date: endDate } }
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return { type: 'weekdays', config: { end_date: endDate } }
  return { type: 'custom', config: { days_of_week: sorted, end_date: endDate } }
}

interface InsertTemplateBody {
  template_id?: string
  days_of_week?: number[]
  reminder_times?: string[]
  phrase?: string
  locale?: string
}

export async function POST(request: Request) {
  let body: InsertTemplateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Template lookup also doubles as an allow-list. Anything not in
  // ACTIVITY_TEMPLATES is rejected, so the client can't craft arbitrary
  // payloads that slip through the service-role insert.
  const template = body.template_id ? getTemplate(body.template_id) : null
  if (!template) return NextResponse.json({ error: 'invalid_template' }, { status: 400 })

  // days_of_week must be a non-empty subset of [0..6].
  const days = Array.isArray(body.days_of_week)
    ? Array.from(new Set(body.days_of_week.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b)
    : []
  if (days.length === 0 || days.length > 7) {
    return NextResponse.json({ error: 'invalid_days' }, { status: 400 })
  }

  // reminder_times: 1..MAX_REMINDER_TIMES HH:MM strings, dedup'd preserving order.
  const rawTimes = Array.isArray(body.reminder_times) ? body.reminder_times : []
  const times: string[] = []
  for (const raw of rawTimes) {
    if (typeof raw !== 'string' || !HH_MM.test(raw)) continue
    if (times.includes(raw)) continue
    times.push(raw)
    if (times.length >= MAX_REMINDER_TIMES) break
  }
  if (times.length === 0) {
    return NextResponse.json({ error: 'invalid_times' }, { status: 400 })
  }

  const phrase = typeof body.phrase === 'string' ? body.phrase.slice(0, MAX_PHRASE_LEN).trim() : ''
  const locale: Locale = (LOCALES as readonly string[]).includes(body.locale ?? '')
    ? (body.locale as Locale)
    : 'es'

  // Caller must be a real signed-in user. Service-role bypass below means we
  // CANNOT trust the body to identify them — the only safe id comes from
  // the cookies-backed Supabase server client.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const today = format(new Date(), 'yyyy-MM-dd')
  const endDate = format(addDays(new Date(), TEMPLATE_RECURRENCE_DAYS), 'yyyy-MM-dd')
  const recurrence = pickRecurrence(days, endDate)

  const title = getMessage(locale, `templates.${template.id}.name`) ?? template.id
  const description = getMessage(locale, `templates.${template.id}.description`) ?? null
  const reminderPhrase = phrase.length > 0 ? phrase : (getMessage(locale, `templates.${template.id}.phrase`) ?? null)

  const admin = billingAdminClient()
  let insertedCount = 0

  try {
    // One recurring activity per reminder time, mirroring the original
    // client-side behavior. Each tree gets its own parent + children.
    for (const time of times) {
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
        reminder_phrase:       reminderPhrase,
        parent_activity_id:    null,
        is_public:             false,
        notes:                 null,
        completion_percentage: 0,
      }

      const instances = generateRecurrenceDates(base.date, recurrence.type, recurrence.config, base.start_time ?? null)

      const { data: parent, error: parentErr } = await admin
        .from('activities')
        .insert(base)
        .select('id')
        .single()
      if (parentErr) throw parentErr
      insertedCount++

      const siblings = instances.slice(1)
      if (siblings.length > 0) {
        const childRows = siblings.map(inst => ({
          ...base,
          date: inst.date,
          ...(inst.start_time ? { start_time: inst.start_time } : {}),
          parent_activity_id: parent.id,
        }))
        const { error: childErr } = await admin.from('activities').insert(childRows)
        if (childErr) throw childErr
        insertedCount += childRows.length
      }
    }
  } catch (err) {
    console.error('[templates insert] failed', err)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, activity_count: insertedCount, template_id: template.id })
}
