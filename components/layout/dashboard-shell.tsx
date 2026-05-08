'use client'

import { useState, useEffect, useRef } from 'react'
import { Menu, Loader2 } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { NotificationBell } from './notification-bell'
import { cn } from '@/lib/utils'
import { initPushNotifications } from '@/lib/push-notifications'
import type { Profile } from '@/types'

interface DashboardShellProps {
  profile: Profile | null
  children: React.ReactNode
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pullDist, setPullDist]       = useState(0)
  const [refreshing, setRefreshing]   = useState(false)
  const mainRef          = useRef<HTMLElement>(null)
  const startYRef        = useRef(0)
  const inScrollableRef  = useRef(false)

  useEffect(() => {
    if (profile?.id) initPushNotifications(profile.id)
  }, [profile?.id])

  // Returns true if the element (or any ancestor up to <main>) is itself scrollable.
  // Used to avoid triggering pull-to-refresh when the user is scrolling a nested
  // overflow container (calendar grid, day panel, time-grid, etc.).
  function touchedScrollable(target: EventTarget | null, boundary: HTMLElement): boolean {
    let node = target as HTMLElement | null
    while (node && node !== boundary) {
      const style = getComputedStyle(node).overflowY
      if ((style === 'auto' || style === 'scroll' || style === 'overlay') &&
          node.scrollHeight > node.clientHeight) {
        return true
      }
      node = node.parentElement
    }
    return false
  }

  // Pull-to-refresh — mobile only, triggers a full page reload.
  // Skipped entirely when the touch starts inside a scrollable child element.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      startYRef.current = e.touches[0].clientY
      inScrollableRef.current = touchedScrollable(e.target, el)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (inScrollableRef.current) return
      if (el.scrollTop > 0) { setPullDist(0); return }
      const dy = e.touches[0].clientY - startYRef.current
      setPullDist(dy > 0 ? Math.min(dy * 0.45, 68) : 0)
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (inScrollableRef.current) { setPullDist(0); return }
      const dy = e.changedTouches[0].clientY - startYRef.current
      if (dy > 72 && el.scrollTop === 0) {
        setRefreshing(true)
        setTimeout(() => window.location.reload(), 180)
      } else {
        setPullDist(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: true })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'shrink-0 xl:flex',
        sidebarOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden'
      )}>
        <AppSidebar profile={profile} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top bar — mobile only ── */}
        <header className="xl:hidden relative flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-foreground transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Centred logo */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <img src="/icon-512.png" alt="" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-semibold text-base tracking-tight">DayFlow</span>
          </div>

          {profile?.id && (
            <NotificationBell userId={profile.id} topBar />
          )}
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto min-w-0">
          {/* Pull-to-refresh indicator — mobile only */}
          <div
            className={cn(
              'xl:hidden flex items-center justify-center overflow-hidden transition-[height] duration-100',
              (pullDist > 0 || refreshing) ? 'opacity-100' : 'opacity-0'
            )}
            style={{ height: refreshing ? 48 : pullDist > 0 ? pullDist : 0 }}
          >
            <Loader2 className={cn(
              'w-5 h-5 text-primary transition-opacity',
              (refreshing || pullDist > 48) ? 'animate-spin opacity-100' : 'opacity-40'
            )} />
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
