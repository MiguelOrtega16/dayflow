import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ActivityStatus, ActivityPriority, TaskCategory } from "@/types"

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
    label: 'To Do',
    color: 'border-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-300',
    dotColor: 'bg-slate-400',
  },
  in_progress: {
    label: 'In Progress',
    color: 'border-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-700 dark:text-amber-300',
    dotColor: 'bg-amber-400',
  },
  done: {
    label: 'Done',
    color: 'border-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  blocked: {
    label: 'Blocked',
    color: 'border-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-300',
    dotColor: 'bg-red-500',
  },
  skipped: {
    label: 'Skipped',
    color: 'border-gray-300',
    bgColor: 'bg-gray-50 dark:bg-gray-800/50',
    textColor: 'text-gray-400 dark:text-gray-500',
    dotColor: 'bg-gray-400',
  },
}

export const PRIORITY_CONFIG: Record<ActivityPriority, {
  label: string
  color: string
  icon: string
}> = {
  low: { label: 'Low', color: 'text-blue-500', icon: '▽' },
  medium: { label: 'Medium', color: 'text-yellow-500', icon: '◇' },
  high: { label: 'High', color: 'text-orange-500', icon: '▲' },
  critical: { label: 'Critical', color: 'text-red-600', icon: '⬆' },
}

// Tasks only — Goals are now a separate entity
export const CATEGORY_CONFIG: Record<TaskCategory, {
  label: string
  emoji: string
  color: string
}> = {
  task:  { label: 'Task',  emoji: '✓',  color: 'text-blue-600' },
  habit: { label: 'Habit', emoji: '🔄', color: 'text-green-600' },
  event: { label: 'Event', emoji: '📅', color: 'text-orange-600' },
  note:  { label: 'Note',  emoji: '📝', color: 'text-gray-600' },
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
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  return `${diffDays}d ago`
}
