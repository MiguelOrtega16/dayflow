'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { deleteActivity } from '@/lib/api'
import { useBackButtonClose } from '@/lib/back-button'
import { pushAdSuppress } from '@/lib/ad-suppress'
import type { Activity } from '@/types'

interface Props {
  activity: Activity
  /** Caller's auth id — we refuse to delete activities that don't belong to
   *  them, matching the previous inline checks in each dropdown surface. */
  currentUserId: string
  onClose: () => void
  /** Fires after a successful delete so the caller can refetch / refresh. */
  onDeleted: () => void
}

export function DeleteActivityDialog({ activity, currentUserId, onClose, onDeleted }: Props) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useBackButtonClose(true, onClose)
  useEffect(() => pushAdSuppress('delete-activity-dialog'), [])

  // Treat anything with a recurrence_type OR a parent_activity_id as "part of
  // a series" — children inherit the parent's recurrence_type but the user
  // might be looking at a child row, so checking either flag catches both.
  const isRecurring = activity.recurrence_type !== 'none' || !!activity.parent_activity_id

  const handleDelete = async (deleteAll: boolean) => {
    if (activity.user_id !== currentUserId) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteActivity(activity.id, deleteAll)
      onDeleted()
      onClose()
    } catch (err) {
      console.error('[delete-activity-dialog] delete failed', err)
      setError(t('calendar.deleteConfirm.error'))
      setBusy(false)
    }
  }

  // Lock body scroll while the dialog is mounted — without this the calendar
  // behind the backdrop scrolls when the user drags on the dialog.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
      <div
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">
                {t('calendar.deleteConfirm.title')}
              </h2>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {activity.title}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            {isRecurring
              ? t('calendar.deleteConfirm.subtitleRecurring')
              : t('calendar.deleteConfirm.subtitleSingle')}
          </p>
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-3">
              {error}
            </p>
          )}
        </div>

        <div className="p-3 pt-0 space-y-2">
          {isRecurring ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(false)}
                className="w-full px-3 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/15 disabled:opacity-50 transition-colors"
              >
                {t('calendar.deleteConfirm.thisOne')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(true)}
                className="w-full px-3 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {t('calendar.deleteConfirm.allRepeats')}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDelete(false)}
              className="w-full px-3 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {t('calendar.deleteConfirm.confirm')}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
