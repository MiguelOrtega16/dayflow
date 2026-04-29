import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ActivityStatus, ActivityPriority, ActivityCategory } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_CONFIG: Record<ActivityStatus, {
  label: string
  color: string
  bgColor: string
  textColor: string
  dotColor: string
}> = {
  todo: {
    label: 'Por hacer',
    color: 'border-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-600/40',
    textColor: 'text-slate-700 dark:text-slate-200',
    dotColor: 'bg-slate-400',
  },
  in_progress: {
    label: 'En progreso',
    color: 'border-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-500/25',
    textColor: 'text-amber-800 dark:text-amber-300',
    dotColor: 'bg-amber-500',
  },
  done: {
    label: 'Completado',
    color: 'border-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-600/25',
    textColor: 'text-emerald-800 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  blocked: {
    label: 'Bloqueado',
    color: 'border-red-400',
    bgColor: 'bg-red-50 dark:bg-red-600/25',
    textColor: 'text-red-800 dark:text-red-300',
    dotColor: 'bg-red-500',
  },
  skipped: {
    label: 'Omitido',
    color: 'border-gray-400 dark:border-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-700/60',
    textColor: 'text-gray-700 dark:text-gray-300',
    dotColor: 'bg-gray-400 dark:bg-gray-500',
  },
}

export const PRIORITY_CONFIG: Record<ActivityPriority, {
  label: string
  color: string
  icon: string
}> = {
  low: { label: 'Baja', color: 'text-blue-500', icon: '▽' },
  medium: { label: 'Media', color: 'text-yellow-500', icon: '◇' },
  high: { label: 'Alta', color: 'text-orange-500', icon: '▲' },
  critical: { label: 'Crítica', color: 'text-red-600', icon: '⬆' },
}

export const CATEGORY_CONFIG: Record<ActivityCategory, {
  label: string
  emoji: string
  color: string
}> = {
  task: { label: 'Tarea', emoji: '✓', color: 'text-blue-600' },
  habit: { label: 'Hábito', emoji: '🔄', color: 'text-green-600' },
  event: { label: 'Evento', emoji: '📅', color: 'text-orange-600' },
  note: { label: 'Nota', emoji: '📝', color: 'text-gray-600' },
}

export const USER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#a855f7', '#ef4444',
]

export function getInitials(name: string | null | undefined, email?: string): string {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }
  return (email || '?')[0].toUpperCase()
}

export function formatTime(time: string | null): string {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${ampm}`
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
