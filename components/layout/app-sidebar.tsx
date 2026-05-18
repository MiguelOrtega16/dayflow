'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { cn, getInitials } from '@/lib/utils'
import { useTheme } from './theme-provider'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import type { Profile } from '@/types'
import {
  ListChecks, Users, Settings,
  LogOut, Sun, Moon, ChevronLeft, ChevronRight,
  BarChart2, CalendarDays, LayoutPanelTop
} from 'lucide-react'

const NAV_KEYS = [
  { href: '/dashboard',          icon: CalendarDays,    key: 'calendar' },
  { href: '/dashboard/overview', icon: ListChecks,      key: 'tasks'    },
  // Metas/Goals temporarily hidden — page + API still exist, just removed from nav.
  // { href: '/dashboard/goals',    icon: Target,          key: 'goals'    },
  { href: '/dashboard/stats',    icon: BarChart2,       key: 'stats'    },
  { href: '/dashboard/people',   icon: Users,           key: 'people'   },
] as const

// Native-only items (hidden on web; only appear inside the Capacitor Android app)
const NATIVE_NAV_KEYS = [
  { href: '/dashboard/widgets', icon: LayoutPanelTop, key: 'widgets' },
] as const

export function AppSidebar({ profile, onNavClick }: { profile: Profile | null; onNavClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [isNative, setIsNative]   = useState(false)
  const [, startTransition]       = useTransition()
  // Optimistic active item — set on tap, cleared once pathname updates.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => { setPendingHref(null) }, [pathname])
  const supabase = createClient()
  const { entitlement } = useEntitlement(profile?.id ?? null)

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  const navItems = isNative ? [...NAV_KEYS, ...NATIVE_NAV_KEYS] : NAV_KEYS

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
        {navItems.map(({ href, icon: Icon, key }) => {
          // Active = optimistic pending OR real current pathname.
          const effectivePath = pendingHref ?? pathname
          const isActive = href === '/dashboard'
            ? effectivePath === '/dashboard'
            : effectivePath.startsWith(href)
          const label = t(`nav.${key}`)
          return (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={(e) => {
                onNavClick?.()
                if (href === pathname) return
                e.preventDefault()
                setPendingHref(href)
                startTransition(() => router.push(href))
              }}
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
          title={collapsed ? t('nav.themeToggle') : undefined}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>{theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}</span>}
        </button>

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? t('nav.settings') : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t('nav.settings')}</span>}
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
                <p className="text-xs font-medium truncate flex items-center gap-1.5">
                  <span className="truncate">{profile?.full_name || profile?.email}</span>
                  {entitlement.isPro && (
                    <span
                      className={cn(
                        'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                        entitlement.isInTrial
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
                      )}
                      title={
                        entitlement.isInTrial
                          ? `Trial — ends ${entitlement.expiresAt ? new Date(entitlement.expiresAt).toLocaleDateString() : ''}`
                          : `Pro — ${entitlement.plan?.replace('pro_', '') ?? ''}`
                      }
                    >
                      {entitlement.isInTrial ? 'Trial' : 'Pro'}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title={t('nav.signOut')}
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
