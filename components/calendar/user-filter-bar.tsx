'use client'

import { cn, getInitials } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { Profile } from '@/types'

interface UserFilterBarProps {
  users: { profile: Profile; isOwn: boolean }[]
  activeUserIds: string[]
  onToggleUser: (id: string) => void
}

export function UserFilterBar({ users, activeUserIds, onToggleUser }: UserFilterBarProps) {
  const { t } = useI18n()
  if (users.length <= 1) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto">
      <span className="text-xs font-medium text-muted-foreground shrink-0">{t('calendar.showing')}</span>
      {users.map(({ profile, isOwn }) => {
        const isActive = activeUserIds.includes(profile.id)
        return (
          <button
            key={profile.id}
            onClick={() => onToggleUser(profile.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all shrink-0',
              isActive
                ? 'border-transparent text-white shadow-sm'
                : 'border-border bg-background text-muted-foreground opacity-50 hover:opacity-70'
            )}
            style={isActive ? { backgroundColor: profile.color } : undefined}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ backgroundColor: profile.color }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
              ) : (
                getInitials(profile.full_name, profile.email)
              )}
            </div>
            {isOwn ? t('common.you') : (profile.full_name || profile.username || profile.email.split('@')[0])}
          </button>
        )
      })}
    </div>
  )
}
