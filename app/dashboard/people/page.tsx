'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchUsers, shareCalendar, removeCalendarShare, getSharedCalendarUsers, respondToCalendarShare, markCalendarShareNotificationRead, updateShareNotificationMutes } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'
import { Search, UserPlus, X, Check, Users, Clock, CheckCircle2, XCircle, Bell, BellOff, ChevronDown, ChevronUp } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { PageTour } from '@/components/onboarding/page-tour'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { useProfile } from '@/lib/profile-context'
import { markDiscoverySeen } from '@/lib/onboarding/discovery-dots'
import type { Profile, SharedCalendar, ShareMutableNotificationType, NotificationType } from '@/types'

const SHARE_NOTIF_TYPES: ShareMutableNotificationType[] = [
  'activity_comment',
  'status_update',
  'new_activity',
]

// Free tier can share with this many people. Pro is unlimited.
// Keep in sync with the RLS subquery in schema.sql.
const FREE_SHARE_LIMIT = 2

export default function PeoplePage() {
  const { t } = useI18n()
  // Profile is hydrated by the dashboard layout's server fetch via context,
  // so this page can render its UI shell immediately and only the share
  // list waits on its own fetch. Aliased to `currentUser` to keep the rest
  // of the file unchanged.
  const { profile: currentUser, setProfile } = useProfile()
  const [sharedCalendars, setSharedCalendars] = useState<SharedCalendar[]>([])
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchResults, setSearchResults]   = useState<Profile[]>([])
  const [searching, setSearching]           = useState(false)
  const [, setLoading]                      = useState(true)
  const [responding, setResponding]         = useState<string | null>(null)
  // Which "visible to me" share row has its notifications panel expanded.
  const [openNotifPanelId, setOpenNotifPanelId] = useState<string | null>(null)
  // Collapsible state for the two list sections. Default open; users with
  // long member lists can collapse to reduce scrolling.
  const [sharedWithOpen, setSharedWithOpen] = useState(true)
  const [visibleOpen, setVisibleOpen]       = useState(true)
  // Pending share IDs the recipient has marked "share my calendar back too".
  // Cleared per-row after the respond call completes.
  const [shareBackIds, setShareBackIds] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const { entitlement } = useEntitlement(currentUser?.id ?? null)
  const { open: openPaywall } = usePaywall()

  useEffect(() => {
    if (currentUser?.id) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  // First-run discovery: this page is the destination the People dot
  // promotes — visiting it clears the dot for next time.
  useEffect(() => {
    if (currentUser?.id) markDiscoverySeen(currentUser, setProfile, 'people')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) return
    // UPDATEs (e.g. toggling notification_mutes) are patched in place from
    // the realtime payload — refetching here caused two regressions: a brief
    // flicker where the SELECT raced with the just-committed UPDATE and
    // returned stale data, and a row-reorder because Postgres returns heap
    // order for the unordered scan. Patching preserves array index and
    // skips the round-trip entirely. INSERT / DELETE still go through
    // loadData() so the member list reflects new or removed shares.
    const patchFromPayload = (payload: any) => {
      const next = payload?.new
      if (!next?.id) return
      setSharedCalendars(prev => prev.map(sc =>
        sc.id === next.id ? { ...sc, ...next } : sc
      ))
    }
    const channel = supabase
      .channel(`people-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'shared_calendars',
        filter: `owner_id=eq.${currentUser.id}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'shared_calendars',
        filter: `owner_id=eq.${currentUser.id}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'shared_calendars',
        filter: `owner_id=eq.${currentUser.id}`,
      }, patchFromPayload)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'shared_calendars',
        filter: `shared_with_id=eq.${currentUser.id}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'shared_calendars',
        filter: `shared_with_id=eq.${currentUser.id}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'shared_calendars',
        filter: `shared_with_id=eq.${currentUser.id}`,
      }, patchFromPayload)
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
    if (!currentUser?.id) return
    const shares = await getSharedCalendarUsers(currentUser.id)
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

  // Some UI toggles cover more than one underlying notification type so the
  // user's mental model ("Status changes") matches every variant we emit.
  // `status_update` and `task_completed` are both emitted by the Postgres
  // trigger depending on whether status === 'done'; users expect a single
  // "status changes" toggle to silence both.
  const toggleTypes = (type: ShareMutableNotificationType): NotificationType[] =>
    type === 'status_update' ? ['status_update', 'task_completed'] : [type]

  // Optimistic toggle of a single notification type on/off for a given
  // incoming share. We patch the local state first so the switch animation
  // is instant; rollback on error keeps the UI in sync with the server.
  const toggleShareMute = async (
    shareId: string,
    type: ShareMutableNotificationType,
    nextEnabled: boolean,
  ) => {
    const current = sharedCalendars.find(sc => sc.id === shareId)
    if (!current) return
    const currentMutes = current.notification_mutes ?? []
    const affected = toggleTypes(type)
    const nextMutes = nextEnabled
      ? currentMutes.filter(m => !affected.includes(m))           // enabling → remove all variants
      : Array.from(new Set([...currentMutes, ...affected]))       // disabling → add all variants

    setSharedCalendars(prev => prev.map(sc =>
      sc.id === shareId ? { ...sc, notification_mutes: nextMutes } : sc
    ))
    try {
      await updateShareNotificationMutes(shareId, nextMutes)
    } catch (err) {
      console.error('[people] toggleShareMute failed', err)
      // Roll back to the previous mutes array
      setSharedCalendars(prev => prev.map(sc =>
        sc.id === shareId ? { ...sc, notification_mutes: currentMutes } : sc
      ))
    }
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

      // Reciprocal "share back" if the recipient ticked the option. We skip
      // when a reverse share already exists (pending or accepted) so we don't
      // create duplicate rows. Failures (e.g. free-tier limit hit on the
      // recipient side) are swallowed — the accept itself already succeeded.
      if (accept && share && shareBackIds.has(shareId)) {
        const alreadyHasReverse = sharedCalendars.some(
          sc => sc.owner_id === currentUser.id
            && sc.shared_with_id === share.owner_id
            && sc.status !== 'declined',
        )
        if (!alreadyHasReverse) {
          try {
            await shareCalendar(currentUser.id, share.owner_id)
          } catch (err) {
            console.warn('[people] reciprocal share failed', err)
          }
        }
      }

      loadData()
    } finally {
      setResponding(null)
      setShareBackIds(prev => {
        if (!prev.has(shareId)) return prev
        const next = new Set(prev)
        next.delete(shareId)
        return next
      })
    }
  }

  const toggleShareBack = (shareId: string) => {
    setShareBackIds(prev => {
      const next = new Set(prev)
      if (next.has(shareId)) next.delete(shareId); else next.add(shareId)
      return next
    })
  }

  const myShares     = sharedCalendars.filter(sc => sc.owner_id === currentUser?.id)
  const sharedWithMe = sharedCalendars.filter(sc => sc.shared_with_id === currentUser?.id)

  const pendingIncoming = sharedWithMe.filter(sc => sc.status === 'pending')
  const acceptedIncoming = sharedWithMe.filter(sc => sc.status === 'accepted')

  const isAlreadyShared = (userId: string) =>
    myShares.some(sc => sc.shared_with_id === userId)

  const prefs = (currentUser?.preferences as Record<string, unknown> | null) ?? {}
  const showTour = !!currentUser && prefs.dismissed_tour_people !== true

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

      {showTour && currentUser && (
        <PageTour
          tourId="people"
          userId={currentUser.id}
          title={t('onboarding.pageTour.people.title')}
          bullets={[
            t('onboarding.pageTour.people.bullets.share'),
            t('onboarding.pageTour.people.bullets.sharedWith'),
            t('onboarding.pageTour.people.bullets.visible'),
            t('onboarding.pageTour.people.bullets.notifications'),
          ]}
        />
      )}

      {pendingIncoming.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5 mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4" /> {t('people.pending')}
            <span className="ml-auto text-xs font-normal">{pendingIncoming.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingIncoming.map(sc => {
              const owner = sc.owner as Profile
              const ownerName = owner?.full_name || owner?.username || t('common.unknown')
              const shareBack = shareBackIds.has(sc.id)
              const alreadyHasReverse = myShares.some(
                m => m.shared_with_id === sc.owner_id && m.status !== 'declined',
              )
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
                      <p className="text-sm font-medium truncate">{ownerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{owner?.email}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t('people.pendingNote')}</p>
                    </div>
                  </div>
                  {!alreadyHasReverse && (
                    <label className="flex items-start gap-2 pl-12 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={shareBack}
                        onChange={() => toggleShareBack(sc.id)}
                        disabled={responding === sc.id}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:opacity-50"
                      />
                      <span className="text-xs text-foreground/80 leading-snug">
                        {t('people.shareBack', { name: ownerName })}
                      </span>
                    </label>
                  )}
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
        <button
          type="button"
          onClick={() => myShares.length > 0 && setSharedWithOpen(o => !o)}
          disabled={myShares.length === 0}
          aria-expanded={sharedWithOpen}
          aria-controls="shared-with-list"
          className={cn(
            'w-full text-left flex items-center gap-2 text-base font-semibold',
            myShares.length === 0 ? 'cursor-default' : 'cursor-pointer',
            sharedWithOpen && myShares.length > 0 ? 'mb-3' : '',
          )}
          title={myShares.length > 0 ? t(sharedWithOpen ? 'people.collapse' : 'people.expand') : undefined}
        >
          <Users className="w-4 h-4 text-primary" /> {t('people.sharedWith')}
          <span className="ml-auto text-xs text-muted-foreground font-normal">{t('people.sharedCount', { count: myShares.length })}</span>
          {myShares.length > 0 && (
            sharedWithOpen
              ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {myShares.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('people.sharedEmpty')}</p>
        ) : sharedWithOpen && (
          <div id="shared-with-list" className="space-y-2">
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
          <button
            type="button"
            onClick={() => setVisibleOpen(o => !o)}
            aria-expanded={visibleOpen}
            aria-controls="visible-calendars-list"
            className={cn(
              'w-full text-left flex items-center gap-2 text-base font-semibold cursor-pointer',
              visibleOpen ? 'mb-3' : '',
            )}
            title={t(visibleOpen ? 'people.collapse' : 'people.expand')}
          >
            {t('people.visibleHeading')}
            <span className="ml-2 text-xs text-muted-foreground font-normal">{t('people.sharedCount', { count: acceptedIncoming.length })}</span>
            <span className="ml-auto" />
            {visibleOpen
              ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          {visibleOpen && (
          <div id="visible-calendars-list" className="space-y-2">
            {acceptedIncoming.map(sc => {
              const owner = sc.owner as Profile
              const mutes = sc.notification_mutes ?? []
              const hasAnyMute   = mutes.length > 0
              const isPanelOpen  = openNotifPanelId === sc.id
              return (
                <div key={sc.id} className="border-b border-border/40 last:border-b-0">
                  <div className="flex items-center gap-3 py-2">
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
                      onClick={() => setOpenNotifPanelId(isPanelOpen ? null : sc.id)}
                      className={cn(
                        'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-colors',
                        isPanelOpen
                          ? 'border-primary/40 bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                      title={t('people.notifSettingsTitle')}
                      aria-expanded={isPanelOpen}
                    >
                      {/* Two states only: Bell (no mutes) vs BellOff (any mute).
                          Color is driven entirely by panel-open state so it
                          never competes with the theme's accent color. */}
                      {hasAnyMute ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleRemove(sc.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-destructive border border-border hover:border-destructive/40 px-2.5 py-1 rounded-lg transition-colors"
                      title={t('people.stopViewingTitle')}
                    >
                      {t('people.stopViewing')}
                    </button>
                  </div>

                  {isPanelOpen && (
                    <div className="pl-12 pr-1 pb-3 space-y-2.5">
                      <p className="text-xs text-muted-foreground">{t('people.notifSettingsHelp')}</p>
                      {SHARE_NOTIF_TYPES.map(type => {
                        const enabled = !mutes.includes(type)
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <span className="flex-1 text-sm">{t(`people.notifType.${type}`)}</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              onClick={() => toggleShareMute(sc.id, type, !enabled)}
                              className={cn(
                                'shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                enabled ? 'bg-primary' : 'bg-muted',
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
                                  enabled ? 'translate-x-4' : 'translate-x-0.5',
                                )}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
