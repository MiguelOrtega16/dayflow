'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Menu, CalendarDays, ListChecks, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { NotificationBell } from './notification-bell'
import { DiscoveryDot } from '@/components/onboarding/discovery-dot'

interface MobileBottomNavProps {
  userId?: string
  onMenuClick: () => void
  showMenuDot?: boolean
}

const TABS = [
  { href: '/dashboard/overview', icon: ListChecks,   key: 'tasks'    },
  { href: '/dashboard',          icon: CalendarDays, key: 'calendar' },
  { href: '/dashboard/stats',    icon: BarChart2,    key: 'stats'    },
] as const

export function MobileBottomNav({ userId, onMenuClick, showMenuDot = false }: MobileBottomNavProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const { t }    = useI18n()
  const [, startTransition] = useTransition()

  // Optimistic active tab — set on tap, cleared once pathname catches up.
  // Without this, the active highlight only updates when the new page is
  // fully ready, which reads as input lag on slower devices.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => { setPendingHref(null) }, [pathname])

  const handleTap = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href === pathname) return                  // already there
    e.preventDefault()                              // we'll navigate manually
    setPendingHref(href)                            // light up the new tab now
    startTransition(() => router.push(href))        // marks navigation as a transition
  }

  return (
    <nav className="xl:hidden shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-14">
        <button
          onClick={onMenuClick}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('nav.openMenu')}
        >
          <DiscoveryDot show={showMenuDot}>
            <Menu className="w-5 h-5" />
          </DiscoveryDot>
          <span className="text-[10px] font-medium">{t('nav.menu')}</span>
        </button>
        {TABS.map(tab => {
          const active = (pendingHref ?? pathname) === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              onClick={handleTap(tab.href)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{t(`nav.${tab.key}`)}</span>
            </Link>
          )
        })}
        <div className="flex-1 flex items-center justify-center">
          {userId && <NotificationBell userId={userId} topBar />}
        </div>
      </div>
    </nav>
  )
}
