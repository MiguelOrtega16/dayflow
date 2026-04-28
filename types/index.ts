export type ActivityStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'skipped'
export type ActivityPriority = 'low' | 'medium' | 'high' | 'critical'
export type ActivityCategory = 'task' | 'habit' | 'event' | 'note'
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'custom'
export type InvitationStatus = 'pending' | 'accepted' | 'declined'
export type NotificationType =
  | 'status_update'
  | 'task_completed'
  | 'goal_completed'
  | 'goal_progress'
  | 'new_activity'
  | 'activity_invitation'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'calendar_share_invite'
  | 'calendar_share_accepted'
  | 'calendar_share_declined'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  color: string
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  user_id: string
  title: string
  description: string | null
  emoji: string | null
  color: string | null
  status: ActivityStatus
  priority: ActivityPriority
  target_date: string | null
  is_public: boolean
  created_at: string
  updated_at: string
  profile?: Profile
  tasks?: Activity[]
  task_count?: number
  done_count?: number
}

export interface Activity {
  id: string
  user_id: string
  title: string
  description: string | null
  date: string
  status: ActivityStatus
  priority: ActivityPriority
  category: ActivityCategory
  goal_id: string | null
  tags: string[]
  color: string | null
  emoji: string | null
  start_time: string | null
  end_time: string | null
  recurrence_type: RecurrenceType
  recurrence_config: RecurrenceConfig | null
  parent_activity_id: string | null
  invited_from_activity_id?: string | null
  evidence_image_url?: string | null
  is_public: boolean
  notes: string | null
  completion_percentage: number
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
  goal?: Pick<Goal, 'id' | 'title' | 'emoji' | 'color'> | null
}

export interface ActivityInvitation {
  id: string
  activity_id: string
  inviter_id: string
  invitee_id: string
  status: InvitationStatus
  created_at: string
  responded_at: string | null
  // Joined
  inviter?: Profile
  invitee?: Profile
  activity?: Activity
}

export interface RecurrenceConfig {
  days_of_week?: number[]
  day_of_month?: number
  interval?: number
  end_date?: string
  occurrences?: number
}

export interface SharedCalendar {
  id: string
  owner_id: string
  shared_with_id: string
  can_edit: boolean
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  owner?: Profile
  shared_with?: Profile
}

export interface Notification {
  id: string
  recipient_id: string
  actor_id: string
  type: NotificationType
  activity_id: string | null
  goal_id: string | null
  message: string
  is_read: boolean
  created_at: string
  actor?: Profile
  activity?: Activity
  goal?: Goal
}

export interface ActivityComment {
  id: string
  activity_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  profile?: Profile
}

export interface DayStats {
  date: string
  total: number
  done: number
  in_progress: number
  todo: number
  blocked: number
  skipped: number
  completion_rate: number
}

export interface CalendarUser {
  profile: Profile
  sharedCalendar?: SharedCalendar
  isOwn: boolean
}
