'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  respondToActivityInvitation, respondToCalendarShare,
} from '@/lib/api'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import type { Notification } from '@/types'

// Shared AudioContext — created once, resumed on first user gesture to satisfy autoplay policy
let sharedAudioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try { sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null }
  }
  return sharedAudioCtx
}

function resumeAudioCtx() {
  const ctx = getAudioCtx()
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
}

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
  activity_reminder:       '⏰',
}

const ACTION_TYPES = new Set(['activity_invitation', 'calendar_share_invite'])

function playNotificationSound() {
  const ctx = getAudioCtx()
  // Skip silently if the context isn't running — happens when no user gesture has occurred yet
  if (!ctx || ctx.state !== 'running') return
  try {
    const play = (freq: number, start: number, dur: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    play(660, 0,    0.18)
    play(880, 0.14, 0.28)
  } catch {
    // silently ignore
  }
}

interface NotificationBellProps {
  userId: string
  collapsed?: boolean
  topBar?: boolean  // compact icon-only style for the top bar
}

export function NotificationBell({ userId, collapsed, topBar }: NotificationBellProps) {
  const [notifications, setNotifications]   = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]       = useState(0)
  const [open, setOpen]                     = useState(false)
  // Keep the panel in the DOM during the closing animation, then unmount.
  const [panelMounted, setPanelMounted]     = useState(false)
  const [bellAnimKey, setBellAnimKey]       = useState(0)
  const [responding, setResponding]         = useState<{ id: string; action: 'accept' | 'decline' } | null>(null)
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleOpen = () => {
    setBellAnimKey(k => k + 1)
    setOpen(prev => !prev)
  }

  useEffect(() => {
    if (open) {
      if (closeTimeout.current) { clearTimeout(closeTimeout.current); closeTimeout.current = null }
      setPanelMounted(true)
    } else if (panelMounted) {
      // Match the panel-out animation duration in tailwind config
      closeTimeout.current = setTimeout(() => setPanelMounted(false), 170)
    }
    return () => { if (closeTimeout.current) { clearTimeout(closeTimeout.current); closeTimeout.current = null } }
  }, [open])
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
      }, (payload: any) => {
        load()
        playNotificationSound()
        // Refresh the calendar when an activity we participate in was updated
        const type = payload?.new?.type
        if (type && ['status_update', 'task_completed', 'new_activity', 'activity_invitation'].includes(type)) {
          window.dispatchEvent(new CustomEvent('dayflow:refresh'))
        }
      })
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

  // Reload notifications when app returns to foreground (mobile Capacitor / tab switch)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [userId])

  // Resume the shared AudioContext on first user interaction so notification sounds can play
  useEffect(() => {
    document.addEventListener('click',      resumeAudioCtx, { passive: true })
    document.addEventListener('touchstart', resumeAudioCtx, { passive: true })
    return () => {
      document.removeEventListener('click',      resumeAudioCtx)
      document.removeEventListener('touchstart', resumeAudioCtx)
    }
  }, [])

  // Polling fallback every 15 s — covers cases where Realtime subscription
  // is blocked by RLS or not enabled for the notifications table in Supabase
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 15_000)
    return () => clearInterval(id)
  }, [userId])

  // Also reload when the rest of the app signals a data refresh
  useEffect(() => {
    const handle = () => load()
    window.addEventListener('dayflow:refresh', handle)
    return () => window.removeEventListener('dayflow:refresh', handle)
  }, [userId])

  const handleMarkRead = async (n: Notification) => {
    if (n.is_read) return
    await markNotificationRead(n.id)
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(userId)
    } catch (err) {
      console.error('[NotificationBell] markAllRead failed:', err)
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    setOpen(false)
  }

  const handleActivityInvitation = async (n: Notification, accept: boolean) => {
    if (!n.activity_id) return
    setResponding({ id: n.id, action: accept ? 'accept' : 'decline' })
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
        const actDate = (inv as any)?.activity?.date as string | undefined
        window.dispatchEvent(new CustomEvent('dayflow:refresh'))
        if (actDate) {
          // Store the date so the calendar picks it up even if we navigate away first
          sessionStorage.setItem('dayflow:gotoDate', actDate)
          window.dispatchEvent(new CustomEvent('dayflow:navigate', { detail: { date: actDate } }))
        }
        setOpen(false)
        router.push('/dashboard')
        return
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
    setResponding({ id: n.id, action: accept ? 'accept' : 'decline' })
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

      if (accept) {
        setOpen(false)
        router.push('/dashboard/people')
        return
      }
      load()
    } catch {} finally {
      setResponding(null)
    }
  }

  return (
    <div ref={dropdownRef}>
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className={cn(
          'relative transition-all duration-200 ease-out active:scale-95',
          topBar
            ? cn(
                'w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted',
                open && 'bg-muted text-foreground'
              )
            : cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm',
                open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                collapsed && 'justify-center px-0'
              )
        )}
        title="Notificaciones"
      >
        <Bell key={bellAnimKey} className="w-4 h-4 shrink-0 origin-top animate-bell-wiggle" />
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

      {panelMounted && (
        <>
          {/* Transparent backdrop — closes panel when clicking anywhere outside */}
          <div
            className={cn('fixed inset-0 z-40 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
            onClick={() => setOpen(false)}
          />

          {/* Panel — fixed at top of viewport so it's never clipped by the sidebar */}
          <div className={cn(
            'fixed z-50 origin-top',
            'top-16 left-2 right-2',
            'sm:top-4 sm:left-auto sm:right-4 sm:w-96',
            'bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden',
            open ? 'animate-panel-in' : 'animate-panel-out'
          )}>
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
                const isLoading = responding?.id === n.id

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
                          {isLoading && responding?.action === 'accept'
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
                          {isLoading && responding?.action === 'decline'
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <XCircle className="w-3 h-3" />}
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
