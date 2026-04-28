import { createClient } from '@/lib/supabase/client'
import type { Activity, ActivityStatus, Goal, Notification, RecurrenceConfig, RecurrenceType } from '@/types'
import { addDays, addWeeks, addMonths, format, parseISO, isWeekend } from 'date-fns'

// ============================================================
// ACTIVITIES
// ============================================================

export async function getActivitiesByDate(date: string, userIds?: string[]) {
  const supabase = createClient()
  let query = supabase
    .from('activities')
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
    .eq('date', date)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (userIds?.length) query = query.in('user_id', userIds)
  const { data, error } = await query
  if (error) throw error
  return data as Activity[]
}

export async function getActivitiesForRange(startDate: string, endDate: string, userIds?: string[]) {
  const supabase = createClient()
  let query = supabase
    .from('activities')
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (userIds?.length) query = query.in('user_id', userIds)
  const { data, error } = await query
  if (error) throw error
  return data as Activity[]
}

export async function createActivity(activity: Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'profile' | 'goal'>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activities')
    .insert(activity)
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
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
    const { error } = await supabase.from('activities').insert(children)
    if (error) throw error
  }
  return parent
}

export function generateRecurrenceDates(startDate: string, recurrenceType: RecurrenceType, config: RecurrenceConfig): string[] {
  const dates: string[] = [startDate]
  let current = parseISO(startDate)
  const maxOccurrences = config.occurrences || 30
  const endDate = config.end_date ? parseISO(config.end_date) : null

  for (let i = 1; i < maxOccurrences; i++) {
    let next: Date
    switch (recurrenceType) {
      case 'daily':    next = addDays(current, config.interval || 1); break
      case 'weekly':   next = addWeeks(current, config.interval || 1); break
      case 'monthly':  next = addMonths(current, config.interval || 1); break
      case 'weekdays':
        next = addDays(current, 1)
        while (isWeekend(next)) next = addDays(next, 1)
        break
      case 'custom':
        if (config.days_of_week?.length) {
          next = addDays(current, 1)
          while (!config.days_of_week.includes(next.getDay())) next = addDays(next, 1)
        } else { next = addDays(current, 7) }
        break
      default: return dates
    }
    if (endDate && next > endDate) break
    dates.push(format(next, 'yyyy-MM-dd'))
    current = next
  }
  return dates
}

export async function updateActivity(id: string, updates: Partial<Activity>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', id)
    .select(`*, profile:profiles(*), goal:goals(id, title, emoji, color)`)
    .single()
  if (error) throw error
  return data as Activity
}

export async function updateActivityStatus(id: string, status: ActivityStatus) {
  return updateActivity(id, {
    status,
    completion_percentage: status === 'done' ? 100 : undefined,
  })
}

export async function deleteActivity(id: string, deleteAll?: boolean) {
  const supabase = createClient()
  if (deleteAll) {
    const { data: activity } = await supabase.from('activities').select('parent_activity_id').eq('id', id).single()
    const parentId = activity?.parent_activity_id || id
    await supabase.from('activities').delete().eq('parent_activity_id', parentId)
    await supabase.from('activities').delete().eq('id', parentId)
  } else {
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error
  }
}

// ============================================================
// GOALS
// ============================================================

export async function getGoals(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Goal[]
}

export async function getGoalsForUsers(userIds: string[]) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .select(`*, profile:profiles(*)`)
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Goal[]
}

export async function createGoal(goal: Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'profile' | 'tasks' | 'task_count' | 'done_count'>) {
  const supabase = createClient()
  const { data, error } = await supabase.from('goals').insert(goal).select().single()
  if (error) throw error
  return data as Goal
}

export async function updateGoal(id: string, updates: Partial<Goal>) {
  const supabase = createClient()
  const { data, error } = await supabase.from('goals').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data as Goal
}

export async function deleteGoal(id: string) {
  const supabase = createClient()
  // Unlink tasks from this goal first (set goal_id to null)
  await supabase.from('activities').update({ goal_id: null }).eq('goal_id', id)
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function getGoalWithTasks(goalId: string) {
  const supabase = createClient()
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single()
  if (goalError) throw goalError

  const { data: tasks } = await supabase
    .from('activities')
    .select('*')
    .eq('goal_id', goalId)
    .order('date', { ascending: true })

  return { ...goal, tasks: tasks || [] } as Goal
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function getNotifications(userId: string, limit = 30) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select(`*, actor:profiles!notifications_actor_id_fkey(*)`)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as Notification[]
}

export async function markNotificationRead(id: string) {
  const supabase = createClient()
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = createClient()
  await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)
  return count || 0
}

// ============================================================
// SHARING
// ============================================================

export async function getSharedCalendarUsers(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_calendars')
    .select(`*, owner:profiles!shared_calendars_owner_id_fkey(*), shared_with:profiles!shared_calendars_shared_with_id_fkey(*)`)
    .or(`owner_id.eq.${userId},shared_with_id.eq.${userId}`)
  if (error) throw error
  return data
}

export async function shareCalendar(ownerId: string, sharedWithId: string, canEdit = false) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_calendars')
    .insert({ owner_id: ownerId, shared_with_id: sharedWithId, can_edit: canEdit })
    .select().single()
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

