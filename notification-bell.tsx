'use client'

import { useEffect, useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import type { Notification } from '@/types'

const TYPE_ICONS: Record<string, string> = {
  task_completed:  '✅',
  status_update:   '🔄',
  goal_completed:  '🎯',
  goal_progress:   '📈',
  new_activity:    '✨',
}

interface NotificationBellProps {
  userId: string
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const load = async () => {
    const data = await getNotifications(userId)
    setNotifications(data)
    setUnreadCount(data.filter(n => !n.is_read).length)
  }

  useEffect(() => {
    load()

    // Real-time subscription for new notifications
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, () => { load() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleOpen = () => {
    setOpen(prev => !prev)
  }

  const handleMarkRead = async (notification: Notification) => {
    if (notification.is_read) return
    await markNotificationRead(notification.id)
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors relative',
          open
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
      >
        <Bell className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Notifications</span>
        {unreadCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-popover border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  You'll see updates when shared users change their activities
                </p>
              </div>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  onClick={() => handleMarkRead(notification)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0',
                    !notification.is_read && 'bg-primary/5'
                  )}
                >
                  {/* Actor avatar */}
                  <div className="shrink-0 mt-0.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: notification.actor?.color || '#6366f1' }}
                    >
                      {notification.actor?.avatar_url ? (
                        <img
                          src={notification.actor.avatar_url}
                          className="w-full h-full rounded-full object-cover"
                          alt=""
                        />
                      ) : (
                        getInitials(notification.actor?.full_name, notification.actor?.email)
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5">
                      <span className="text-base leading-none mt-0.5 shrink-0">
                        {TYPE_ICONS[notification.type] || '🔔'}
                      </span>
                      <p className="text-sm leading-snug text-foreground">
                        {notification.message}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
