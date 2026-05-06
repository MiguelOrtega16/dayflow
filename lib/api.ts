import { createClient } from '@/lib/supabase/client'
import type { Activity, ActivityInvitation, ActivityStatus, Goal, Notification, RecurrenceConfig, RecurrenceType } from '@/types'
import { addDays, addWeeks, addMonths, format, parseISO, isWeekend } from 'date-fns'
import { sendNotificationEmail } from '@/lib/email'
import { sendPushNotification } from '@/lib/push-notifications'

// ─── Activities ──────────────────────────────────────────────────────────────

export async function getActivitiesByDate(date: string, userIds?: string[]) {
  const supabase = createClient()

  let query = supabase
    .from('activities')
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
    .eq('date', date)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Activity[]
}

export async function getActivitiesForRange(
  startDate: string,
  endDate: string,
  userIds?: string[],
  currentUserId?: string,
) {
  const supabase = createClient()

  // 1. Activities owned by the user(s) in the filter list
  let query = supabase
    .from('activities')
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds)
  }

  const { data: ownedData, error } = await query
  if (error) throw error

  // 2. Participant statuses for owned activities (so owners can see each invitee's progress)
  let participantsByActivity: Record<string, Activity['participants']> = {}
  if (currentUserId && ownedData && ownedData.length > 0) {
    const ownedIds = ownedData.map((a: any) => a.id)
    const { data: invites } = await supabase
      .from('activity_invitations')
      .select('activity_id, invitee_id, profile:profiles!activity_invitations_invitee_id_fkey(id, full_name, email, color, avatar_url)')
      .in('activity_id', ownedIds)
      .eq('status', 'accepted')

    if (invites) {
      for (const inv of invites as any[]) {
        if (!participantsByActivity[inv.activity_id]) participantsByActivity[inv.activity_id] = []
        participantsByActivity[inv.activity_id]!.push({
          invitee_id: inv.invitee_id,
          profile: inv.profile,
        })
      }
    }
  }

  // 3. Activities the current user was invited to and accepted
  let participantData: Activity[] = []
  if (currentUserId) {
    const { data: invitations } = await supabase
      .from('activity_invitations')
      .select('id, activity_id')
      .eq('invitee_id', currentUserId)
      .eq('status', 'accepted')

    if (invitations && invitations.length > 0) {
      const ids = invitations.map(i => i.activity_id)
      const { data: invitedActs } = await supabase
        .from('activities')
        .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
        .in('id', ids)
        .gte('date', startDate)
        .lte('date', endDate)

      if (invitedActs) {
        participantData = invitedActs.map(act => {
          const inv = invitations.find(i => i.activity_id === act.id)!
          return {
            ...act,
            invitation_id: inv.id,
          }
        })
      }
    }
  }

  // Attach participant statuses to owned activities
  const enrichedOwned: Activity[] = (ownedData || []).map((a: any) => ({
    ...a,
    participants: participantsByActivity[a.id] || [],
  }))

  // Merge, deduplicating by id (owner's record takes priority)
  const seen = new Set<string>()
  const merged: Activity[] = []
  for (const a of [...enrichedOwned, ...participantData]) {
    if (!seen.has(a.id)) { seen.add(a.id); merged.push(a) }
  }
  return merged
}

export async function createActivity(activity: Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'profile' | 'goal'>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activities')
    .insert(activity)
    .select('*')
    .single()

  if (error) throw error
  return data as Activity
}

export async function createRecurringActivities(
  baseActivity: Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'profile' | 'goal'>,
  recurrenceType: RecurrenceType,
  recurrenceConfig: RecurrenceConfig
) {
  const supabase = createClient()
  const dates = generateRecurrenceDates(baseActivity.date, recurrenceType, recurrenceConfig)

  const { data: parent, error: parentError } = await supabase
    .from('activities')
    .insert({ ...baseActivity, recurrence_type: recurrenceType, recurrence_config: recurrenceConfig })
    .select()
    .single()

  if (parentError) throw parentError

  const children = dates.slice(1).map(date => ({
    ...baseActivity,
    date,
    parent_activity_id: parent.id,
    recurrence_type: recurrenceType,
    recurrence_config: recurrenceConfig,
  }))

  if (children.length > 0) {
    const { error: childrenError } = await supabase.from('activities').insert(children)
    if (childrenError) throw childrenError
  }

  return parent
}

export function generateRecurrenceDates(
  startDate: string,
  recurrenceType: RecurrenceType,
  config: RecurrenceConfig
): string[] {
  const dates: string[] = [startDate]
  let current = parseISO(startDate)
  const maxOccurrences = config.occurrences || 30
  const endDate = config.end_date ? parseISO(config.end_date) : null

  for (let i = 1; i < maxOccurrences; i++) {
    let next: Date

    switch (recurrenceType) {
      case 'daily':
        next = addDays(current, config.interval || 1)
        break
      case 'weekly':
        next = addWeeks(current, config.interval || 1)
        break
      case 'monthly':
        next = addMonths(current, config.interval || 1)
        break
      case 'weekdays':
        next = addDays(current, 1)
        while (isWeekend(next)) next = addDays(next, 1)
        break
      case 'custom':
        if (config.days_of_week && config.days_of_week.length > 0) {
          next = addDays(current, 1)
          while (!config.days_of_week.includes(next.getDay())) next = addDays(next, 1)
        } else {
          next = addDays(current, 7)
        }
        break
      default:
        return dates
    }

    if (endDate && next > endDate) break
    dates.push(format(next, 'yyyy-MM-dd'))
    current = next
  }

  return dates
}

export async function updateActivity(id: string, updates: Partial<Activity>, updaterId?: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  if (updaterId) notifyActivityParticipants(data as Activity, updaterId, updates).catch(() => {})
  return data as Activity
}

export async function updateActivityStatus(id: string, status: ActivityStatus, updaterId?: string) {
  return updateActivity(id, {
    status,
    completion_percentage: status === 'done' ? 100 : status === 'skipped' ? 0 : undefined,
  }, updaterId)
}

async function notifyActivityParticipants(
  activity: Activity,
  updaterId: string,
  updates: Partial<Activity>,
) {
  const supabase  = createClient()
  const origId    = (activity as any).invited_from_activity_id || activity.id

  // Find original owner
  const { data: orig } = await supabase
    .from('activities').select('user_id, title').eq('id', origId).single()
  if (!orig) return

  // Find accepted invitees
  const { data: invs } = await supabase
    .from('activity_invitations').select('invitee_id')
    .eq('activity_id', origId).eq('status', 'accepted')

  const participants = new Set<string>([orig.user_id])
  invs?.forEach(i => participants.add(i.invitee_id))
  participants.delete(updaterId)
  if (participants.size === 0) return

  const type = updates.status ? 'status_update' : 'new_activity'
  const statusLabels: Record<string, string> = {
    todo: 'Por hacer', in_progress: 'En progreso', done: 'Completado',
    blocked: 'Bloqueado', skipped: 'Omitido',
  }
  const message = updates.status
    ? `Estado de "${orig.title}" cambiado a: ${statusLabels[updates.status] ?? updates.status}`
    : `"${orig.title}" fue actualizada`

  await Promise.all([...participants].map(recipientId =>
    supabase.from('notifications').insert({
      recipient_id: recipientId,
      actor_id:     updaterId,
      type,
      activity_id:  origId,
      message,
    })
  ))
}

export async function deleteActivity(id: string, deleteAll?: boolean) {
  const supabase = createClient()

  if (deleteAll) {
    const { data: activity } = await supabase
      .from('activities')
      .select('parent_activity_id')
      .eq('id', id)
      .single()

    const parentId = activity?.parent_activity_id || id
    await supabase.from('activities').delete().eq('parent_activity_id', parentId)
    await supabase.from('activities').delete().eq('id', parentId)
  } else {
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error
  }
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getGoals(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .select(`*, tasks:activities(id, title, status, emoji, category, date)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(g => ({
    ...g,
    task_count: g.tasks?.length ?? 0,
    done_count: g.tasks?.filter((t: any) => t.status === 'done').length ?? 0,
  })) as Goal[]
}

export async function createGoal(goal: Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'profile' | 'tasks' | 'task_count' | 'done_count'>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .insert(goal)
    .select()
    .single()

  if (error) throw error
  return { ...data, tasks: [], task_count: 0, done_count: 0 } as Goal
}

export async function updateGoal(id: string, updates: Partial<Omit<Goal, 'tasks' | 'task_count' | 'done_count'>>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Goal
}

export async function deleteGoal(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

export async function getSharedCalendarUsers(userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('shared_calendars')
    .select(`
      *,
      owner:profiles!shared_calendars_owner_id_fkey(*),
      shared_with:profiles!shared_calendars_shared_with_id_fkey(*)
    `)
    .or(`owner_id.eq.${userId},shared_with_id.eq.${userId}`)

  if (error) throw error
  return data
}

export async function removeCalendarShare(shareId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('shared_calendars').delete().eq('id', shareId)
  if (error) throw error
}

export async function searchUsers(query: string, excludeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', excludeId)
    .or(`username.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10)

  if (error) throw error
  return data
}

// ─── Activity Comments ────────────────────────────────────────────────────────

export async function getActivityComments(activityId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activity_comments')
    .select('*, profile:profiles(*)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createActivityComment(activityId: string, userId: string, content: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activity_comments')
    .insert({ activity_id: activityId, user_id: userId, content })
    .select('*, profile:profiles(*)')
    .single()

  if (error) throw error
  return data
}

export async function deleteActivityComment(commentId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('activity_comments')
    .delete()
    .eq('id', commentId)

  if (error) throw error
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId: string, limit = 30) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select(`*, actor:profiles!notifications_actor_id_fkey(*)`)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []) as Notification[]
}

export async function markNotificationRead(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)

  if (error) throw error
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)

  if (error) console.error('[markAllNotificationsRead]', error)
}

// ─── Activity Title Suggestions ───────────────────────────────────────────────

export async function getActivityTitleSuggestions(userId: string, query: string) {
  if (!query.trim() || query.length < 2) return []
  const supabase = createClient()
  const { data } = await supabase
    .from('activities')
    .select('title')
    .eq('user_id', userId)
    .ilike('title', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(6)
  const seen = new Set<string>()
  return (data || [])
    .map(r => r.title as string)
    .filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
}

// ─── Activity Invitations ─────────────────────────────────────────────────────

export async function getActivityInvitations(activityId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activity_invitations')
    .select(`
      *,
      invitee:profiles!activity_invitations_invitee_id_fkey(*),
      inviter:profiles!activity_invitations_inviter_id_fkey(*)
    `)
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as ActivityInvitation[]
}

export async function getMyPendingActivityInvitations(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activity_invitations')
    .select(`
      *,
      inviter:profiles!activity_invitations_inviter_id_fkey(*),
      activity:activities(id, title, date, emoji, category, start_time, end_time)
    `)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as ActivityInvitation[]
}

export async function inviteToActivity(activityId: string, inviterId: string, inviteeId: string) {
  const supabase = createClient()

  const { data: inv, error } = await supabase
    .from('activity_invitations')
    .insert({ activity_id: activityId, inviter_id: inviterId, invitee_id: inviteeId })
    .select(`*, inviter:profiles!activity_invitations_inviter_id_fkey(*), activity:activities(title)`)
    .single()
  if (error) throw error

  const inviterName = (inv as any).inviter?.full_name || (inv as any).inviter?.email || 'Alguien'
  const actTitle   = (inv as any).activity?.title || 'una actividad'

  await supabase.from('notifications').insert({
    recipient_id: inviteeId,
    actor_id: inviterId,
    type: 'activity_invitation',
    activity_id: activityId,
    message: `${inviterName} te invitó a: ${actTitle}`,
  })

  sendNotificationEmail({
    recipientId: inviteeId,
    senderName:  inviterName,
    subject:     `${inviterName} te invitó a una actividad en DayFlow`,
    title:       'Nueva invitación a actividad',
    message:     `<strong>${inviterName}</strong> te invitó a participar en: <strong>${actTitle}</strong>. Abre DayFlow para aceptar o declinar.`,
    ctaText:     'Ver en DayFlow',
    ctaUrl:      `${process.env.NEXT_PUBLIC_APP_URL || 'https://dayflow.vercel.app'}/dashboard`,
  })

  sendPushNotification({
    recipientId: inviteeId,
    title: '👋 Nueva invitación',
    body:  `${inviterName} te invitó a: ${actTitle}`,
  })

  return inv as ActivityInvitation
}

export async function respondToActivityInvitation(
  invitationId: string,
  accept: boolean,
  userId: string,
) {
  const supabase = createClient()

  const { data: inv, error: fetchErr } = await supabase
    .from('activity_invitations')
    .select(`*, activity:activities(*)`)
    .eq('id', invitationId)
    .eq('invitee_id', userId)
    .single()
  if (fetchErr) throw fetchErr

  // If the activity join returned null (RLS blocked it), fetch it directly.
  // This happens when the invitee has no calendar-share with the inviter.
  // The activities RLS should now include an invitation-based exception,
  // but this is an extra safety net.
  if (accept && !(inv as any).activity && (inv as any).activity_id) {
    const { data: act } = await supabase
      .from('activities')
      .select('*')
      .eq('id', (inv as any).activity_id)
      .single()
    if (act) (inv as any).activity = act
    else console.warn('[respondToActivityInvitation] activity still null after direct fetch — RLS may need updating')
  }

  // Mark invitation accepted/declined — no activity copy is created.
  // Participants share the original activity record; each tracks their own
  // progress via activity_invitations.participant_status.
  const { error: updErr } = await supabase
    .from('activity_invitations')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (updErr) throw updErr

  const { data: me } = await supabase.from('profiles').select('full_name,email').eq('id', userId).single()
  const meName   = (me as any)?.full_name || (me as any)?.email || 'Alguien'
  const actTitle = (inv as any).activity?.title || 'tu actividad'
  const actDate  = (inv as any).activity?.date  || ''

  const acceptMsg = actDate
    ? `${meName} aceptó tu invitación a: ${actTitle} (${actDate})`
    : `${meName} aceptó tu invitación a: ${actTitle}`

  await supabase.from('notifications').insert({
    recipient_id: (inv as any).inviter_id,
    actor_id:     userId,
    type:         accept ? 'invitation_accepted' : 'invitation_declined',
    activity_id:  (inv as any).activity_id,
    message:      accept
      ? acceptMsg
      : `${meName} declinó tu invitación a: ${actTitle}`,
  })
}

export async function updateParticipantStatus(invitationId: string, status: ActivityStatus, updaterId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('activity_invitations')
    .update({ participant_status: status })
    .eq('id', invitationId)
    .eq('invitee_id', updaterId)
  if (error) throw error

  // Notify other participants that this person updated their status
  const { data: inv } = await supabase
    .from('activity_invitations')
    .select('activity_id, activity:activities(title, user_id)')
    .eq('id', invitationId)
    .single()

  if (inv) {
    const activity = (inv as any).activity
    if (activity) {
      notifyActivityParticipants(
        { id: inv.activity_id, user_id: activity.user_id, title: activity.title } as any,
        updaterId,
        { status },
      ).catch(() => {})
    }
  }
}

export async function cancelActivityInvitation(invitationId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('activity_invitations').delete().eq('id', invitationId)
  if (error) throw error
}

// ─── Calendar Share Acceptance ────────────────────────────────────────────────

export async function shareCalendar(ownerId: string, sharedWithId: string, canEdit = false) {
  const supabase = createClient()

  const { data: share, error } = await supabase
    .from('shared_calendars')
    .insert({ owner_id: ownerId, shared_with_id: sharedWithId, can_edit: canEdit, status: 'pending' })
    .select(`*, owner:profiles!shared_calendars_owner_id_fkey(*)`)
    .single()
  if (error) throw error

  const ownerName = (share as any).owner?.full_name || (share as any).owner?.email || 'Alguien'

  await supabase.from('notifications').insert({
    recipient_id: sharedWithId,
    actor_id: ownerId,
    type: 'calendar_share_invite',
    message: `${ownerName} quiere compartir su calendario contigo`,
  })

  sendNotificationEmail({
    recipientId: sharedWithId,
    senderName:  ownerName,
    subject:     `${ownerName} quiere compartir su calendario contigo`,
    title:       'Invitación de calendario compartido',
    message:     `<strong>${ownerName}</strong> te ha invitado a ver su calendario en DayFlow. Acepta la invitación para empezar a colaborar.`,
    ctaText:     'Ver en DayFlow',
    ctaUrl:      `${process.env.NEXT_PUBLIC_APP_URL || 'https://dayflow.vercel.app'}/dashboard/people`,
  })

  sendPushNotification({
    recipientId: sharedWithId,
    title: '📅 Calendario compartido',
    body:  `${ownerName} quiere compartir su calendario contigo`,
  })

  return share
}

export async function respondToCalendarShare(shareId: string, accept: boolean, userId: string) {
  const supabase = createClient()

  const { data: share, error: fetchErr } = await supabase
    .from('shared_calendars')
    .select(`*, shared_with:profiles!shared_calendars_shared_with_id_fkey(*)`)
    .eq('id', shareId)
    .eq('shared_with_id', userId)
    .single()
  if (fetchErr) throw fetchErr

  const { error: updErr } = await supabase
    .from('shared_calendars')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', shareId)
  if (updErr) throw updErr

  const meName = (share as any).shared_with?.full_name || (share as any).shared_with?.email || 'Alguien'

  await supabase.from('notifications').insert({
    recipient_id: (share as any).owner_id,
    actor_id: userId,
    type: accept ? 'calendar_share_accepted' : 'calendar_share_declined',
    message: accept
      ? `${meName} aceptó compartir tu calendario`
      : `${meName} declinó compartir tu calendario`,
  })
}

// ─── Evidence Images ──────────────────────────────────────────────────────────

export async function uploadEvidenceImage(file: File, activityId: string, userId: string): Promise<string> {
  const supabase = createClient()
  const ext  = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${activityId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from('activity-evidence').upload(path, file, { upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from('activity-evidence').getPublicUrl(path)
  return data.publicUrl
}

export async function updateActivityEvidence(activityId: string, evidenceImageUrl: string | null) {
  const supabase = createClient()
  const { error } = await supabase
    .from('activities')
    .update({ evidence_image_url: evidenceImageUrl })
    .eq('id', activityId)
  if (error) throw error
}
