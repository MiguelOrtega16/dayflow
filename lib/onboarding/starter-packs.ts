import type { ActivityTemplate } from '@/lib/activity-templates'
import { getTemplate } from '@/lib/activity-templates'

/**
 * Curated bundles of templates surfaced as a one-tap onboarding wedge to
 * brand-new users with an empty calendar. Each pack composes existing
 * ACTIVITY_TEMPLATES entries — that keeps the i18n strings, recurrence
 * defaults, and insert logic in a single source of truth. To add or rename
 * a pack, edit the array below and the matching `onboarding.packs.<id>`
 * i18n keys; no schema changes required.
 */

export type StarterPackId =
  | 'healthy_habits'
  | 'student_focus'
  | 'wellness_reset'
  | 'power_mornings'

export interface StarterPack {
  id: StarterPackId
  emoji: string
  template_ids: readonly string[]
}

export const STARTER_PACKS: readonly StarterPack[] = [
  {
    id: 'healthy_habits',
    emoji: '🌱',
    template_ids: ['drink_water', 'brush_teeth', 'journal', 'go_to_bed_early'],
  },
  {
    id: 'student_focus',
    emoji: '🎓',
    template_ids: ['get_up_early', 'study', 'take_a_break', 'review_today'],
  },
  {
    id: 'wellness_reset',
    emoji: '🪷',
    template_ids: ['meditation', 'journal', 'take_a_walk', 'be_grateful'],
  },
  {
    id: 'power_mornings',
    emoji: '☀️',
    template_ids: ['get_up_early', 'stretch', 'meditation', 'drink_water'],
  },
] as const

export function getStarterPack(id: string): StarterPack | null {
  return STARTER_PACKS.find(p => p.id === id) ?? null
}

export function resolveTemplates(pack: StarterPack): ActivityTemplate[] {
  return pack.template_ids
    .map(id => getTemplate(id))
    .filter((t): t is ActivityTemplate => t !== null)
}

/** Count of distinct recurring activities a pack will create when inserted —
 *  one per reminder_time per template. Used for the confirmation copy
 *  ("Add 8 activities to your week"). */
export function countActivitiesInPack(pack: StarterPack): number {
  return resolveTemplates(pack).reduce(
    (sum, t) => sum + t.defaults.reminder_times.length,
    0,
  )
}
