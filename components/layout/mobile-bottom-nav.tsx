'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, CalendarDays, LayoutDashboard, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from './notification-bell'

interface MobileBottomNavProps {
  userId?: string
  onMenuClick: () => void
}

const TABS = [
  { href: '/dashboard/overview', icon: LayoutDashboard, label: 'Tareas'        },
  { href: '/dashboard',          icon: CalendarDays,    label: 'Calendario'    },
  { href: '/dashboard/stats',    icon: BarChart2,       label: 'Estadísticas'  },
]

export function MobileBottomNav({ userId, onMenuClick }: MobileBottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="xl:hidden shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-14">
        <button
          onClick={onMenuClick}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Menú</span>
        </button>
        {TABS.map(tab => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
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
