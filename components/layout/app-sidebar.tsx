'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { cn, getInitials } from '@/lib/utils'
import { useTheme } from './theme-provider'
import type { Profile } from '@/types'
import {
  LayoutDashboard, Users, Settings,
  LogOut, Sun, Moon, ChevronLeft, ChevronRight,
  Target, BarChart2, CalendarDays, LayoutPanelTop
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', icon: CalendarDays, label: 'Calendario' },
  { href: '/dashboard/overview', icon: LayoutDashboard, label: 'Resumen' },
  { href: '/dashboard/goals', icon: Target, label: 'Metas' },
  { href: '/dashboard/stats', icon: BarChart2, label: 'Estadísticas' },
  { href: '/dashboard/people', icon: Users, label: 'Personas' },
]

// Native-only items (hidden on web; only appear inside the Capacitor Android app)
const NATIVE_NAV_ITEMS = [
  { href: '/dashboard/widgets', icon: LayoutPanelTop, label: 'Widgets' },
]

export function AppSidebar({ profile, onNavClick }: { profile: Profile | null; onNavClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [isNative, setIsNative]   = useState(false)
  const supabase = createClient()

  // Capacitor.isNativePlatform() is safe to call on the client; we still want
  // this in an effect so SSR markup matches first paint.
  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  const navItems = isNative ? [...NAV_ITEMS, ...NATIVE_NAV_ITEMS] : NAV_ITEMS

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0',
        collapsed && 'justify-center px-0'
      )}>
        <img src="/icon-512.png" alt="DayFlow" className="w-8 h-8 rounded-lg shrink-0 object-cover" />
        {!collapsed && (
          <span className="font-semibold text-xl tracking-tight">DayFlow</span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted z-10 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 min-w-0 overflow-hidden',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-2 border-t border-border space-y-0.5">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Cambiar tema' : undefined}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Configuración' : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </Link>

        {/* Profile & Sign out */}
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-2 mt-1 pt-2 border-t border-border',
          collapsed && 'justify-center flex-col px-0'
        )}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: profile?.color || '#6366f1' }}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
            ) : (
              getInitials(profile?.full_name, profile?.email)
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{profile?.full_name || profile?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
