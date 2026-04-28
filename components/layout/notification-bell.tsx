'use client'

import { useEffect, useState, useRef } from 'react'
import { Bell, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  respondToActivityInvitation, respondToCalendarShare,
} from '@/lib/api'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import type { Notification } from '@/types'

const TYPE_ICONS: Record<string, string> = {
  task_completed:          '✅',
  status_update:           '🔄',
  goal_completed:          '🎯',
  goal_progress:           '📈',
  new_activity:            '✨',
  activity_invitation:     '👋',
  invitation_accepted:     '🎉',
  invitation_declined:     '❌',
  calendar_share_invite:   '📅',
  calendar_share_accepted: '🤝',
  calendar_share_declined: '🚫',
}

const ACTION_TYPES = new Set(['activity_invitation', 'calendar_share_invite'])

interface NotificationBellProps {
  userId: string
  collapsed?: boolean
  topBar?: boolean  // compact icon-only style for the top bar
}

export function NotificationBell({ userId, collapsed, topBar }: NotificationBellProps) {
  const [notifications, setNotifications]   = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]       = useState(0)
  const [open, setOpen]                     = useState(false)
  const [responding, setResponding]         = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const channelName = useRef(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
  const supabase    = createClient()

  const load = async () => {
    const data = await getNotifications(userId)
    setNotifications(data)
    setUnreadCount(data.filter(n => !n.is_read).length)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMarkRead = async (n: Notification) => {
    if (n.is_read) return
    await markNotificationRead(n.id)
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleActivityInvitation = async (n: Notification, accept: boolean) => {
    if (!n.activity_id) return
    setResponding(n.id)
    try {
      // Find pending invitation for this activity
      const { data: inv } = await supabase
        .from('activity_invitations')
        .select('id, activity:activities(date, title)')
        .eq('activity_id', n.activity_id)
        .eq('invitee_id', userId)
        .eq('status', 'pending')
        .single()

      if (inv?.id) {
        await respondToActivityInvitation(inv.id, accept, userId)
      }

      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount(prev => Math.max(0, prev - 1))

      if (accept) {
        // Signal the calendar to refresh and navigate to the activity date
        window.dispatchEvent(new CustomEvent('dayflow:refresh'))
        const actDate = (inv as any)?.activity?.date
        if (actDate) {
          window.dispatchEvent(new CustomEvent('dayflow:navigate', { detail: { date: actDate } }))
        }
      }

      load()
      setOpen(false)
    } catch (err) {
      console.error('[NotificationBell] invitation response failed:', err)
    } finally {
      setResponding(null)
    }
  }

  const handleCalendarShare = async (n: Notification, accept: boolean) => {
    setResponding(n.id)
    try {
      // Find pending calendar share for this actor→recipient pair
      const { data } = await supabase
        .from('shared_calendars')
        .select('id')
        .eq('owner_id', n.actor_id)
        .eq('shared_with_id', userId)
        .eq('status', 'pending')
        .single()

      if (data?.id) {
        await respondToCalendarShare(data.id, accept, userId)
      }
      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {} finally {
      setResponding(null)
    }
  }

  return (
    <div ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'relative transition-colors',
          topBar
            ? 'w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground'
            : cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm',
                open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                collapsed && 'justify-center px-0'
              )
        )}
        title="Notificaciones"
      >
        <Bell className="w-4 h-4 shrink-0" />
        {!topBar && !collapsed && <span className="flex-1 text-left">Notificaciones</span>}
        {unreadCount > 0 && (
          <span className={cn(
            'rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0',
            topBar || collapsed
              ? 'absolute -top-1 -right-1 w-4 h-4'
              : 'w-5 h-5'
          )}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Transparent backdrop — closes panel when clicking anywhere outside */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel — fixed at top of viewport so it's never clipped by the sidebar */}
          <div className="fixed z-50 animate-scale-in
            top-16 left-2 right-2
            sm:top-4 sm:left-auto sm:right-4 sm:w-96
            bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Notificaciones</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline font-medium">
                Marcar todo leído
              </button>
            )}
          </div>

          <div className="max-h-[75vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Sin notificaciones aún</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Aquí aparecen las actualizaciones de usuarios compartidos
                </p>
              </div>
            ) : (
              notifications.map(n => {
                const isAction = ACTION_TYPES.has(n.type) && !n.is_read
                const isLoading = responding === n.id

                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex flex-col px-4 py-3 border-b border-border/50 last:border-b-0 transition-colors',
                      !n.is_read && 'bg-primary/5',
                      !isAction && 'hover:bg-muted/50 cursor-pointer'
                    )}
                    onClick={!isAction ? () => handleMarkRead(n) : undefined}
                  >
                    <div className="flex items-start gap-3">
                      {/* Actor avatar */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                        style={{ backgroundColor: n.actor?.color || '#6366f1' }}
                      >
                        {n.actor?.avatar_url
                          ? <img src={n.actor.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                          : getInitials(n.actor?.full_name, n.actor?.email)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5">
                          <span className="text-base leading-none mt-0.5 shrink-0">
                            {TYPE_ICONS[n.type] || '🔔'}
                          </span>
                          <p className="text-sm leading-snug text-foreground">{n.message}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(n.created_at)}
                        </p>
                      </div>

                      {!n.is_read && !isAction && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                      )}
                    </div>

                    {/* Action buttons for invitations */}
                    {isAction && (
                      <div className="flex items-center gap-2 mt-2.5 ml-11">
                        <button
                          onClick={() => n.type === 'activity_invitation'
                            ? handleActivityInvitation(n, true)
                            : handleCalendarShare(n, true)}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {isLoading
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                          Aceptar
                        </button>
                        <button
                          onClick={() => n.type === 'activity_invitation'
                            ? handleActivityInvitation(n, false)
                            : handleCalendarShare(n, false)}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          Declinar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}
