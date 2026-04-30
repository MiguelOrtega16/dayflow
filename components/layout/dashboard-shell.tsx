'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { NotificationBell } from './notification-bell'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'

interface DashboardShellProps {
  profile: Profile | null
  children: React.ReactNode
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

        {/* ── Top bar — mobile only; desktop uses the sidebar + CalendarHeader bell ── */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
          {/* Left: hamburger + logo on mobile; empty on desktop (sidebar handles branding) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-foreground transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Right: notification bell — always top-right */}
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
