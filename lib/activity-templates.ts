import type { ActivityCategory } from '@/types'

/**
 * Curated catalog of habit / reminder starters surfaced under
 * /dashboard/templates. The catalog is intentionally a TS file (not a DB
 * table) so adding / renaming / translating an entry is just a code edit
 * with no migration. If we ever need admin editing or A/B testing we can
 * move it server-side.
 *
 * Each template maps to ONE activity per reminder_time when the user taps
 * "Add to my list" — so e.g. "Drink water" with 4 times yields 4 recurring
 * activities, all sharing title / reminder_phrase / recurrence_config.
 */

export const TEMPLATE_CATEGORIES = ['health', 'life', 'sports', 'mind', 'quit'] as const
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]

export interface TemplateDefaults {
  /** 0 = Sunday … 6 = Saturday. Defines the weekly recurrence pattern. */
  days_of_week: number[]
  /** 'HH:mm' clock times. One activity is created per entry on Add-to-list. */
  reminder_times: string[]
  /** Maps to activities.category. Reminders auto-mark done after firing;
   *  habits stay until the user logs them. */
  activity_category: ActivityCategory
}

export interface ActivityTemplate {
  id: string
  category: TemplateCategory
  emoji: string
  /** Visual flourishes shown on the list. */
  popular?: boolean
  isNew?: boolean
  defaults: TemplateDefaults
}

const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAYS  = [1, 2, 3, 4, 5]
const WEEKENDS  = [0, 6]

export const ACTIVITY_TEMPLATES: readonly ActivityTemplate[] = [
  // ── Health ────────────────────────────────────────────────────────────────
  {
    id: 'drink_water', category: 'health', emoji: '🚰', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['10:00', '13:00', '16:00', '19:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'brush_teeth', category: 'health', emoji: '🦷', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['08:00', '22:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'take_a_shower', category: 'health', emoji: '🚿',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['08:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'go_to_bed_early', category: 'health', emoji: '🌙', popular: true,
    defaults: {
      // Skipping weekends matches the screenshot's smart default.
      days_of_week: WEEKDAYS,
      reminder_times: ['22:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'get_up_early', category: 'health', emoji: '🌅',
    defaults: {
      days_of_week: WEEKDAYS,
      reminder_times: ['06:30'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'medication_reminder', category: 'health', emoji: '💊',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['08:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'take_a_break', category: 'health', emoji: '☕',
    defaults: {
      days_of_week: WEEKDAYS,
      reminder_times: ['15:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'eat_fruits', category: 'health', emoji: '🍐',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['11:00'],
      activity_category: 'habit',
    },
  },

  // ── Life ──────────────────────────────────────────────────────────────────
  {
    id: 'study', category: 'life', emoji: '🎓', popular: true,
    defaults: {
      days_of_week: WEEKDAYS,
      reminder_times: ['19:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'cooking', category: 'life', emoji: '🍳', isNew: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['18:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'clean_house', category: 'life', emoji: '🧹', popular: true,
    defaults: {
      days_of_week: [6], // Saturday
      reminder_times: ['10:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'skin_care', category: 'life', emoji: '🧴', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'track_expenses', category: 'life', emoji: '💰',
    defaults: {
      days_of_week: [0], // Sunday
      reminder_times: ['20:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'go_shopping', category: 'life', emoji: '🛒',
    defaults: {
      days_of_week: [6],
      reminder_times: ['10:00'],
      activity_category: 'task',
    },
  },
  {
    id: 'make_the_bed', category: 'life', emoji: '🛏️',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['07:30'],
      activity_category: 'habit',
    },
  },
  {
    id: 'feed_pets', category: 'life', emoji: '🐾',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['08:00', '18:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'keep_reading', category: 'life', emoji: '📗', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'habit',
    },
  },

  // ── Sports ────────────────────────────────────────────────────────────────
  {
    id: 'go_exercising', category: 'sports', emoji: '🏃', popular: true,
    defaults: {
      days_of_week: [1, 3, 5], // Mon/Wed/Fri
      reminder_times: ['18:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'take_a_walk', category: 'sports', emoji: '🚶', isNew: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['19:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'stretch', category: 'sports', emoji: '🤸',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['07:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'swimming', category: 'sports', emoji: '🏊',
    defaults: {
      days_of_week: [2, 4], // Tue/Thu
      reminder_times: ['18:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'practice_yoga', category: 'sports', emoji: '🧘',
    defaults: {
      days_of_week: [1, 3, 5],
      reminder_times: ['07:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'cycling', category: 'sports', emoji: '🚴',
    defaults: {
      days_of_week: WEEKENDS,
      reminder_times: ['10:00'],
      activity_category: 'habit',
    },
  },

  // ── Mind ──────────────────────────────────────────────────────────────────
  {
    id: 'pray', category: 'mind', emoji: '🙏', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['20:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'meditation', category: 'mind', emoji: '🪷',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['07:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'journal', category: 'mind', emoji: '✒️', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'review_today', category: 'mind', emoji: '📹',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'be_grateful', category: 'mind', emoji: '❤️', popular: true,
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'habit',
    },
  },
  {
    id: 'practice_smiling', category: 'mind', emoji: '😊',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['09:00'],
      activity_category: 'habit',
    },
  },

  // ── Quit ──────────────────────────────────────────────────────────────────
  // Seed entries — you can add/remove freely. Most of these benefit from
  // multiple per-day pings since the urge is acute and time-of-day specific.
  {
    id: 'quit_smoking', category: 'quit', emoji: '🚭',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['09:00', '13:00', '17:00', '21:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'less_screen_time', category: 'quit', emoji: '📱',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['21:00'],
      activity_category: 'reminder',
    },
  },
  {
    id: 'quit_junk_food', category: 'quit', emoji: '🍔',
    defaults: {
      days_of_week: ALL_DAYS,
      reminder_times: ['12:00', '19:00'],
      activity_category: 'reminder',
    },
  },
] as const

export function getTemplate(id: string): ActivityTemplate | null {
  return ACTIVITY_TEMPLATES.find(t => t.id === id) ?? null
}

export function templatesByCategory(category: TemplateCategory): ActivityTemplate[] {
  return ACTIVITY_TEMPLATES.filter(t => t.category === category)
}
