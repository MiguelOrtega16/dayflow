/**
 * Client-side CSV export helpers. Stays in the browser — no server route
 * needed — so the existing Supabase RLS already governs what the user can
 * see (and therefore what they can export).
 */

import type { Activity, ActivityCategory, ActivityStatus } from '@/types'

// Escape a single field for CSV per RFC 4180: wrap in quotes when the value
// contains a comma, quote, newline, or carriage return; double any embedded
// quotes. Stringifies non-strings.
function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(',')
}

/**
 * Build a CSV from a list of activities. Includes a BOM so Excel/Google
 * Sheets autodetect UTF-8 (without it, accented characters render as
 * mojibake when the user opens the file in Excel on Windows).
 */
export function activitiesToCsv(
  activities: Activity[],
  labels: {
    date: string
    title: string
    description: string
    category: string
    status: string
    priority: string
    startTime: string
    endTime: string
    completion: string
    tags: string
    goal: string
    reminders: string
    recurrence: string
    isShared: string
    createdAt: string
    categoryLabels: Record<ActivityCategory, string>
    statusLabels: Record<ActivityStatus, string>
  },
): string {
  const header = csvRow([
    labels.date, labels.title, labels.description, labels.category, labels.status,
    labels.priority, labels.startTime, labels.endTime, labels.completion,
    labels.tags, labels.goal, labels.reminders, labels.recurrence,
    labels.isShared, labels.createdAt,
  ])

  const rows = activities.map(a => csvRow([
    a.date,
    a.title,
    a.description ?? '',
    labels.categoryLabels[a.category] ?? a.category,
    labels.statusLabels[a.status] ?? a.status,
    a.priority,
    a.start_time ?? '',
    a.end_time ?? '',
    a.completion_percentage,
    (a.tags ?? []).join('; '),
    a.goal?.title ?? '',
    // Reminder offsets are minutes-before-start. Join with semicolons because
    // commas would split the cell, and we already use ';' for tags.
    (a.reminder_offsets ?? []).join('; '),
    a.recurrence_type,
    a.invitation_id ? 'yes' : 'no',
    a.created_at,
  ]))

  // BOM + CRLF line endings (RFC 4180 + Excel-friendly).
  return '﻿' + [header, ...rows].join('\r\n')
}

/**
 * Trigger a download for a string payload in the browser. Cleans up the
 * object URL after a short tick so the GC can reclaim the Blob.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
