'use client'

import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
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

  useEffect(() => {
    if (profile?.id) initPushNotifications(profile.id)
  }, [profile?.id])

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'shrink-0 md:flex',
        sidebarOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden'
      )}>
        <AppSidebar profile={profile} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top bar — mobile only ── */}
        <header className="md:hidden relative flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
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

        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
