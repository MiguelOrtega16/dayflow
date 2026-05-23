'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchUsers, shareCalendar, removeCalendarShare, getSharedCalendarUsers, respondToCalendarShare, markCalendarShareNotificationRead } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'
import { Search, UserPlus, X, Check, Users, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import type { Profile, SharedCalendar } from '@/types'

// Free tier can share with this many people. Pro is unlimited.
// Keep in sync with the RLS subquery in schema.sql.
const FREE_SHARE_LIMIT = 2

export default function PeoplePage() {
  const { t } = useI18n()
  const [currentUser, setCurrentUser]       = useState<Profile | null>(null)
  const [sharedCalendars, setSharedCalendars] = useState<SharedCalendar[]>([])
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchResults, setSearchResults]   = useState<Profile[]>([])
  const [searching, setSearching]           = useState(false)
  const [, setLoading]                      = useState(true)
  const [responding, setResponding]         = useState<string | null>(null)
  const supabase = createClient()
  const { entitlement } = useEntitlement(currentUser?.id ?? null)
  const { open: openPaywall } = usePaywall()

  useEffect(() => { loadData() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel(`people-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shared_calendars',
        filter: `owner_id=eq.${currentUser.id}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shared_calendars',
        filter: `shared_with_id=eq.${currentUser.id}`,
      }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const tmr = setTimeout(async () => {
      if (!currentUser) return
      setSearching(true)
      try {
        const results = await searchUsers(searchQuery, currentUser.id)
        setSearchResults(results || [])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(tmr)
  }, [searchQuery, currentUser])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setCurrentUser(profile)
    const shares = await getSharedCalendarUsers(user.id)
    setSharedCalendars((shares || []) as SharedCalendar[])
    setLoading(false)
  }

  const handleShare = async (targetUser: Profile) => {
    if (!currentUser) return

    // Cap: free users can share with FREE_SHARE_LIMIT people. Declined invites
    // don't count toward the cap (the recipient said no, so the slot is open).
    const activeShareCount = sharedCalendars.filter(
      sc => sc.owner_id === currentUser.id && sc.status !== 'declined'
    ).length
    if (!entitlement.isPro && activeShareCount >= FREE_SHARE_LIMIT) {
      openPaywall('sharing_limit')
      return
    }

    try {
      await shareCalendar(currentUser.id, targetUser.id)
      setSearchQuery('')
      setSearchResults([])
      loadData()
    } catch (err) {
      // Server-side RLS rejection (e.g. raced limit, client check bypassed) —
      // fall back to the paywall instead of a silent failure.
      const msg = String((err as { message?: string })?.message ?? err)
      if (msg.includes('row-level security') || msg.includes('violates')) {
        openPaywall('sharing_limit')
      } else {
        console.error('[people] shareCalendar failed', err)
      }
    }
  }

  const handleRemove = async (shareId: string) => {
    if (!currentUser) return
    const share = sharedCalendars.find(sc => sc.id === shareId)
    if (!share) return
    if (share.owner_id === currentUser.id) {
      // Owner revoking a share they created — fully delete the row.
      await removeCalendarShare(shareId)
    } else {
      // Recipient stopping view — RLS forbids delete for non-owners, so
      // update the share's status to 'declined'. Same end-state as the
      // initial decline flow: the share drops out of the recipient's
      // "Calendarios visibles" list and the owner's calendar/activities
      // stop appearing for them. The owner sees the share marked declined.
      await respondToCalendarShare(shareId, false, currentUser.id)
    }
    loadData()
  }

  const handleRespond = async (shareId: string, accept: boolean) => {
    if (!currentUser) return
    setResponding(shareId)
    try {
      const share = sharedCalendars.find(sc => sc.id === shareId)
      await respondToCalendarShare(shareId, accept, currentUser.id)
      if (share) {
        await markCalendarShareNotificationRead(currentUser.id, share.owner_id)
      }
      loadData()
    } finally {
      setResponding(null)
    }
  }

  const myShares     = sharedCalendars.filter(sc => sc.owner_id === currentUser?.id)
  const sharedWithMe = sharedCalendars.filter(sc => sc.shared_with_id === currentUser?.id)

  const pendingIncoming = sharedWithMe.filter(sc => sc.status === 'pending')
  const acceptedIncoming = sharedWithMe.filter(sc => sc.status === 'accepted')

  const isAlreadyShared = (userId: string) =>
    myShares.some(sc => sc.shared_with_id === userId)

  const STATUS_COLOR: Record<string, string> = {
    pending:  'text-amber-600 dark:text-amber-400',
    accepted: 'text-emerald-600 dark:text-emerald-400',
    declined: 'text-red-500 dark:text-red-400',
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold">{t('people.title')}</h1>
          <InfoTooltip text={t('people.info')} />
        </div>
        <p className="text-muted-foreground">{t('people.subtitle')}</p>
      </div>

      {pendingIncoming.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5 mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4" /> {t('people.pending')}
            <span className="ml-auto text-xs font-normal">{pendingIncoming.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingIncoming.map(sc => {
              const owner = sc.owner as Profile
              return (
                <div key={sc.id} className="bg-background/60 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: owner?.color || '#6366f1' }}>
                      {owner?.avatar_url
                        ? <img src={owner.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(owner?.full_name, owner?.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{owner?.full_name || owner?.username || t('common.unknown')}</p>
                      <p className="text-xs text-muted-foreground truncate">{owner?.email}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t('people.pendingNote')}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-12">
                    <button
                      onClick={() => handleRespond(sc.id, true)}
                      disabled={responding === sc.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('common.accept')}
                    </button>
                    <button
                      onClick={() => handleRespond(sc.id, false)}
                      disabled={responding === sc.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {t('common.decline')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> {t('people.share')}
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('people.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 border border-border rounded-xl overflow-hidden">
            {searchResults.map(user => {
              const already = isAlreadyShared(user.id)
              return (
                <div key={user.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: user.color }}>
                    {user.avatar_url
                      ? <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(user.full_name, user.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.full_name || user.username || t('common.unknown')}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => !already && handleShare(user)}
                    disabled={already}
                    className={cn(
                      'shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      already ? 'bg-muted text-muted-foreground cursor-default' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    {already ? <><Check className="w-3 h-3" /> {t('people.sent')}</> : <><UserPlus className="w-3 h-3" /> {t('people.sendShare')}</>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {searching && <p className="text-xs text-muted-foreground mt-2 px-1">{t('people.searching')}</p>}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {t('people.sharedWith')}
          <span className="ml-auto text-xs text-muted-foreground font-normal">{t('people.sharedCount', { count: myShares.length })}</span>
        </h2>
        {myShares.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('people.sharedEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {myShares.map(sc => {
              const user = sc.shared_with as Profile
              return (
                <div key={sc.id} className="flex items-center gap-3 py-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: user?.color || '#6366f1' }}>
                    {user?.avatar_url
                      ? <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(user?.full_name, user?.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.full_name || user?.username || t('common.unknown')}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    <p className={cn('text-xs font-medium mt-0.5', STATUS_COLOR[sc.status || 'pending'])}>
                      {t(`shareStatus.${sc.status || 'pending'}`)}
                    </p>
                  </div>
                  <button onClick={() => handleRemove(sc.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={t('people.remove')}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {acceptedIncoming.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold mb-3">
            {t('people.visibleHeading')}
            <span className="ml-2 text-xs text-muted-foreground font-normal">{t('people.sharedCount', { count: acceptedIncoming.length })}</span>
          </h2>
          <div className="space-y-2">
            {acceptedIncoming.map(sc => {
              const owner = sc.owner as Profile
              return (
                <div key={sc.id} className="flex items-center gap-3 py-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: owner?.color || '#6366f1' }}>
                    {owner?.avatar_url
                      ? <img src={owner.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(owner?.full_name, owner?.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{owner?.full_name || owner?.username || t('common.unknown')}</p>
                    <p className="text-xs text-muted-foreground truncate">{owner?.email}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(sc.id)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-destructive border border-border hover:border-destructive/40 px-2.5 py-1 rounded-lg transition-colors"
                    title={t('people.stopViewingTitle')}
                  >
                    {t('people.stopViewing')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
