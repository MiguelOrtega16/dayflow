'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, getYear,
} from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { getActivitiesForRange } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { getColombiaHolidays } from '@/lib/holidays'
import type { Activity, Profile } from '@/types'
import { DayCell } from './day-cell'
import { DayDetailPanel } from './day-detail-panel'
import { CalendarHeader } from './calendar-header'
import { UserFilterBar } from './user-filter-bar'
import { ActivityFormModal } from '../activities/activity-form-modal'
import { useI18n, weekdayShort, dateFnsLocale } from '@/lib/i18n'
import { useDateTimePrefs } from '@/lib/datetime-prefs'
import { scheduleActivityReminders } from '@/lib/activity-reminders'
import { syncWidgetSnapshot } from '@/lib/widget-sync'
import { CompactMonthGrid } from './compact-month-grid'
import { TimeGridView } from './time-grid-view'

type CalendarMode = 'month' | 'week' | 'day'

interface CalendarViewProps {
  currentUser: Profile | null
  sharedCalendars: any[]
}

export function CalendarView({ currentUser, sharedCalendars }: CalendarViewProps) {
  const { t, locale } = useI18n()
  // The user's preference, resolved against the i18n locale ('system' →
  // Mon for ES, Sun for EN). Drives both the week-grid layout and the
  // weekday-header order.
  const { resolveWeekStart } = useDateTimePrefs()
  const weekStartsOn = resolveWeekStart()
  // Use client-side new Date() so the initial day reflects the user's local timezone,
  // not the server's UTC date (which can differ by a day near midnight).
  const [currentDate, setCurrentDate]   = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Restore last viewed date so a refresh doesn't jump back to today.
    // Guard required: useState initializers run on the server (SSR) where sessionStorage doesn't exist.
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('dayflow:selectedDate')
      if (saved) {
        const d = new Date(saved + 'T12:00:00')
        if (!isNaN(d.getTime())) return d
      }
    }
    return new Date()
  })
  const [mode, setMode]                 = useState<CalendarMode>('month')
  const [activities, setActivities]     = useState<Activity[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [modalInitialTime, setModalInitialTime] = useState<{ start: string; end: string } | null>(null)
  // Category pre-selection for newly-opened create modals — driven by the
  // ?type= query param the daily-summary notification's action buttons set
  // (+ Task → 'task', + Reminder → 'reminder'). Cleared on modal close so a
  // subsequent FAB tap doesn't keep the previous pre-selection.
  const [modalInitialCategory, setModalInitialCategory] = useState<'task' | 'reminder' | undefined>(undefined)
  const [activeUserIds, setActiveUserIds] = useState<string[]>([])
  // Pending deep-link target set by the notification bell when the user
  // clicks a comment / status / new-activity notification. Once consumed by
  // DayDetailPanel (scroll + open thread), we clear it so subsequent renders
  // don't re-trigger.
  const [pendingOpen, setPendingOpen] = useState<{ activityId: string; openComments: boolean } | null>(null)
  // Detected client-side after hydration; starts false (SSR-safe)
  const [isMobile, setIsMobile]   = useState(false)
  // Tablet: 768–1279 px — uses bottom panel instead of right-side panel
  const [isTablet, setIsTablet]   = useState(false)
  // Landscape-shaped viewport (w > h). Used together with isTablet to fall
  // back to the desktop right-side panel layout for tablet-width viewports
  // that are too short for the 50dvh bottom panel to leave room for any
  // activities — mostly mobile phones rotated to landscape (e.g. S24 Ultra
  // ~882×412 lands in the tablet width range but a 50dvh panel on 412 px
  // crushes the activity list to 0 px tall).
  const [isLandscape, setIsLandscape] = useState(false)
  // True while the user is focused in a comment composer inside the day
  // detail panel. Mobile view hides the FAB and the compact month grid
  // while composing so the keyboard-driven layout doesn't crowd the send
  // button or overlap the panel header on top of the grid.
  const [composing, setComposing] = useState(false)
  // Live copy of shared calendars — the server prop is static; this refreshes in real-time
  const [liveSharedCalendars, setLiveSharedCalendars] = useState(sharedCalendars)
  const supabase = createClient()

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1280)
      setIsLandscape(w > h)
    }
    check()
    window.addEventListener('resize', check)
    // Capacitor Android WebView doesn't always fire `resize` on rotation;
    // listen to orientationchange + visualViewport as well, and re-check
    // after a short delay so we read the post-rotation dimensions instead
    // of the stale pre-rotation ones.
    const onOrientation = () => { check(); setTimeout(check, 250) }
    window.addEventListener('orientationchange', onOrientation)
    window.visualViewport?.addEventListener('resize', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', onOrientation)
      window.visualViewport?.removeEventListener('resize', check)
    }
  }, [])

  // Layout selection by form factor + orientation:
  //   - Mobile portrait                  → compact grid + bottom day panel
  //   - Tablet portrait                  → full calendar + bottom 50dvh panel
  //   - Mobile landscape, tablet landscape, desktop → right-side panel
  // The mobile-landscape case matters for Samsung phones (e.g. S24 Ultra)
  // whose landscape viewport can fall below 768 px when Display Size is
  // set to Large/Largest; without this distinction, rotating to landscape
  // kept the mobile portrait layout and left the activity list with no
  // vertical room to render.
  const isMobilePortrait = isMobile && !isLandscape
  const useBottomPanel   = isTablet && !isLandscape

  // Refresh shared calendars from the DB (called on realtime events & dayflow:refresh)
  const refreshSharedCalendars = useCallback(async () => {
    if (!currentUser) return
    const { data } = await supabase
      .from('shared_calendars')
      .select('*, owner:profiles!shared_calendars_owner_id_fkey(*), shared_with:profiles!shared_calendars_shared_with_id_fkey(*)')
      .or(`owner_id.eq.${currentUser.id},shared_with_id.eq.${currentUser.id}`)
      .eq('status', 'accepted')
    if (data) setLiveSharedCalendars(data)
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel(`shared-cals-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shared_calendars',
      }, () => refreshSharedCalendars())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser?.id, refreshSharedCalendars])

  // Build list of all visible users from the live snapshot
  const allUsers: { profile: Profile; isOwn: boolean }[] = []
  const seenUserIds = new Set<string>()
  if (currentUser) {
    allUsers.push({ profile: currentUser, isOwn: true })
    seenUserIds.add(currentUser.id)
  }
  // Chips represent calendars I can actually see — only shares where someone
  // shared their calendar TO me. Outbound shares (owner_id === me) don't grant
  // me visibility into their activities, so they'd be inert filters.
  liveSharedCalendars.forEach((sc: any) => {
    if (sc.shared_with_id !== currentUser?.id || !sc.owner) return
    const profile: Profile = sc.owner
    if (!seenUserIds.has(profile.id)) {
      allUsers.push({ profile, isOwn: false })
      seenUserIds.add(profile.id)
    }
  })

  useEffect(() => {
    if (activeUserIds.length === 0 && allUsers.length > 0) {
      setActiveUserIds(allUsers.map(u => u.profile.id))
    }
  }, [allUsers.length])

  // ── Mobile week view: 3 days centred on selectedDate ─────────────────────────
  const isMobileWeek = isMobile && mode === 'week'
  const isMobileDay  = isMobile && mode === 'day'

  const getDateRange = useCallback(() => {
    if (mode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn })
      const end   = endOfWeek(endOfMonth(currentDate), { weekStartsOn })
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
    } else if (mode === 'day') {
      const s = format(selectedDate, 'yyyy-MM-dd')
      return { start: s, end: s }
    } else if (isMobileWeek) {
      return {
        start: format(subDays(selectedDate, 1), 'yyyy-MM-dd'),
        end:   format(addDays(selectedDate, 1), 'yyyy-MM-dd'),
      }
    } else {
      const start = startOfWeek(currentDate, { weekStartsOn })
      const end   = endOfWeek(currentDate, { weekStartsOn })
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
    }
  }, [currentDate, mode, isMobileWeek, selectedDate])

  const fetchActivities = useCallback(async () => {
    if (activeUserIds.length === 0) { setActivities([]); setLoading(false); return }
    setLoading(true)
    try {
      const { start, end } = getDateRange()
      const data = await getActivitiesForRange(start, end, activeUserIds, currentUser?.id)
      setActivities(data)
      scheduleActivityReminders(data)
      if (currentUser?.id) syncWidgetSnapshot(currentUser.id)
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }, [getDateRange, activeUserIds, currentUser?.id])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  // Widget auth sync is now hoisted into the dashboard shell so it runs
  // across the whole dashboard, not just when the calendar view is mounted.

  useEffect(() => {
    if (activeUserIds.length === 0) return
    const channel = supabase
      .channel('activities-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'activities',
        filter: `user_id=in.(${activeUserIds.join(',')})`,
      }, () => fetchActivities())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeUserIds, getDateRange])

  // Listen for global signals dispatched after accepting an activity invitation
  // from the notification bell (which has no direct access to this component).
  useEffect(() => {
    const onRefresh = () => { fetchActivities(); refreshSharedCalendars() }
    window.addEventListener('dayflow:refresh', onRefresh)
    return () => window.removeEventListener('dayflow:refresh', onRefresh)
  }, [fetchActivities, refreshSharedCalendars])

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const date = (e as CustomEvent<{ date: string }>).detail?.date
      if (!date) return
      const d = new Date(date + 'T12:00:00') // noon to avoid timezone edge-cases
      setCurrentDate(d)
      setSelectedDate(d)
    }
    window.addEventListener('dayflow:navigate', onNavigate)
    return () => window.removeEventListener('dayflow:navigate', onNavigate)
  }, [])

  // Onboarding hook — the setup checklist sits outside this component but
  // wants to open the activity-form modal from its "Add first activity"
  // step. Listening here keeps the modal owned by CalendarView; the checklist
  // just yells into the window.
  useEffect(() => {
    const onOpenAdd = () => {
      setModalInitialTime(null)
      setEditingActivity(null)
      setShowAddModal(true)
    }
    window.addEventListener('dayflow:open-add-activity', onOpenAdd)
    return () => window.removeEventListener('dayflow:open-add-activity', onOpenAdd)
  }, [])

  // Persist the selected date so a page refresh returns to the same day.
  // IMPORTANT: format in LOCAL timezone, not UTC. toISOString() returns the
  // UTC date, which jumps a day forward in negative-UTC timezones during the
  // evening — so navigating away then back would land on tomorrow.
  useEffect(() => {
    sessionStorage.setItem('dayflow:selectedDate', format(selectedDate, 'yyyy-MM-dd'))
  }, [selectedDate])

  // Pick up a date stored by push-notification deep links (fires after full-page reload)
  // This intentionally overwrites dayflow:selectedDate for the push-nav case.
  useEffect(() => {
    const gotoDate = sessionStorage.getItem('dayflow:gotoDate')
    if (!gotoDate) return
    sessionStorage.removeItem('dayflow:gotoDate')
    const d = new Date(gotoDate + 'T12:00:00')
    setCurrentDate(d)
    setSelectedDate(d)

    // Notification-bell deep link: open & scroll to a specific activity, and
    // optionally pop the comment thread. Read here (same tick as the date)
    // so DayDetailPanel sees both props in the same render that re-keys it
    // to the new date.
    const openActivityId = sessionStorage.getItem('dayflow:openActivityId')
    if (openActivityId) {
      const openComments = sessionStorage.getItem('dayflow:openActivityComments') === '1'
      sessionStorage.removeItem('dayflow:openActivityId')
      sessionStorage.removeItem('dayflow:openActivityComments')
      setPendingOpen({ activityId: openActivityId, openComments })
    }
  }, [])

  // Also react to in-session dayflow:navigate dispatches that carry a deep
  // link (notification bell tap while the dashboard is already mounted —
  // no full-page reload, so the sessionStorage-on-mount effect above
  // doesn't fire).
  useEffect(() => {
    const onNavigate = () => {
      const openActivityId = sessionStorage.getItem('dayflow:openActivityId')
      if (!openActivityId) return
      const openComments = sessionStorage.getItem('dayflow:openActivityComments') === '1'
      sessionStorage.removeItem('dayflow:openActivityId')
      sessionStorage.removeItem('dayflow:openActivityComments')
      setPendingOpen({ activityId: openActivityId, openComments })
    }
    window.addEventListener('dayflow:navigate', onNavigate)
    return () => window.removeEventListener('dayflow:navigate', onNavigate)
  }, [])

  // ?create=YYYY-MM-DD (or 'today') from the morning-notification action button
  // and the daily-summary tray entry's + Task / + Reminder buttons: jump to
  // that date and open the create modal. Optional ?type=task|reminder pre-
  // selects the category so the modal opens already on the right tab.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const raw    = params.get('create')
    if (!raw) return
    const target = raw === 'today' ? new Date() : new Date(raw + 'T12:00:00')
    if (isNaN(target.getTime())) return
    setCurrentDate(target)
    setSelectedDate(target)
    const type = params.get('type')
    if (type === 'task' || type === 'reminder') {
      setModalInitialCategory(type)
    }
    setShowAddModal(true)
    // Clean the URL so a refresh doesn't reopen the modal
    const next = new URL(window.location.href)
    next.searchParams.delete('create')
    next.searchParams.delete('type')
    window.history.replaceState(null, '', next.pathname + next.search)
  }, [])

  // ?date=YYYY-MM-DD from a widget tap: jump to that date. The optional
  //   ?view=day  switch — sent by the Day / Agenda widgets — also flips
  // the calendar into day mode so the user lands on the time-grid view of
  // the activity they tapped. The optional ?activity=<id> queues an open-
  // and-scroll for that activity once the day's data has loaded.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const raw    = params.get('date')
    if (!raw) return
    const target = new Date(raw + 'T12:00:00')
    if (isNaN(target.getTime())) return
    setCurrentDate(target)
    setSelectedDate(target)
    if (params.get('view') === 'day') setMode('day')
    const activityId = params.get('activity')
    if (activityId) setPendingOpen({ activityId, openComments: false })
    const next = new URL(window.location.href)
    next.searchParams.delete('date')
    next.searchParams.delete('view')
    next.searchParams.delete('activity')
    window.history.replaceState(null, '', next.pathname + next.search)
  }, [])

  const getDaysForView = (): Date[] => {
    if (mode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn })
      const end   = endOfWeek(endOfMonth(currentDate), { weekStartsOn })
      return eachDayOfInterval({ start, end })
    } else if (mode === 'day') {
      return [selectedDate]
    } else if (isMobileWeek) {
      return [subDays(selectedDate, 1), selectedDate, addDays(selectedDate, 1)]
    } else {
      const start = startOfWeek(currentDate, { weekStartsOn })
      const end   = endOfWeek(currentDate, { weekStartsOn })
      return eachDayOfInterval({ start, end })
    }
  }

  // Days for the compact week strip (always 7)
  const weekStripDays = eachDayOfInterval({
    start: startOfWeek(isMobileWeek ? selectedDate : currentDate, { weekStartsOn }),
    end:   endOfWeek(isMobileWeek ? selectedDate : currentDate, { weekStartsOn }),
  })

  const getActivitiesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return activities.filter(a => a.date === dateStr)
  }

  // Animation cue for swipe/arrow navigation. The key changes on each move
  // (forces React to remount the wrapped grid so the CSS animation re-fires)
  // and `swipeDir` decides which side the new view slides in from. Going
  // forward (next) slides in from the right; back slides in from the left,
  // matching the user's intent when they swipe with their finger.
  const [swipeAnimKey, setSwipeAnimKey] = useState(0)
  const [swipeDir, setSwipeDir] = useState<'prev' | 'next'>('next')
  const swipeAnimClass = swipeDir === 'next' ? 'animate-swipe-in-from-right' : 'animate-swipe-in-from-left'

  const navigate = (direction: 'prev' | 'next') => {
    setSwipeDir(direction)
    setSwipeAnimKey(k => k + 1)
    const d = direction === 'next' ? 1 : -1
    if (mode === 'month') {
      // Keep selectedDate aligned with the new month so the day-detail panel
      // doesn't keep pointing at a date outside the fetched range — that
      // mismatch is why the header used to still read "May 22" but the
      // activities list was empty after swiping into June. Preserve the
      // day-of-month, clamping to the new month's last day when needed
      // (date-fns addMonths handles the clamp for us).
      const newCurrent  = d > 0 ? addMonths(currentDate, 1)  : subMonths(currentDate, 1)
      const newSelected = d > 0 ? addMonths(selectedDate, 1) : subMonths(selectedDate, 1)
      setCurrentDate(newCurrent)
      setSelectedDate(newSelected)
    } else if (mode === 'day') {
      const next = addDays(selectedDate, d)
      setSelectedDate(next); setCurrentDate(next)
    } else if (isMobileWeek) {
      const next = addDays(selectedDate, d * 7)
      setSelectedDate(next); setCurrentDate(next)
    } else {
      // Desktop week mode: same fix as month — move selectedDate by a week
      // so the header date and the visible week stay in agreement.
      const newCurrent  = d > 0 ? addWeeks(currentDate, 1)  : subWeeks(currentDate, 1)
      const newSelected = addDays(selectedDate, d * 7)
      setCurrentDate(newCurrent)
      setSelectedDate(newSelected)
    }
  }

  // Jump directly to a month/year picked from the header's MonthYearPicker.
  // For mobile week view we also realign the selected day so the week strip
  // shows the target month — otherwise the strip stays on the previous week
  // and the title and visible days disagree.
  const jumpToDate = (date: Date) => {
    setCurrentDate(date)
    if (isMobileWeek) setSelectedDate(date)
  }

  const days = getDaysForView()

  // Week day headers — 7 fixed labels for month/desktop week, dynamic 3 for
  // mobile week. The static list is Sun→Sat; rotate it so it matches the
  // user's first-day preference.
  const baseWeekday = weekdayShort(locale)
  const rotatedWeekday = [...baseWeekday.slice(weekStartsOn), ...baseWeekday.slice(0, weekStartsOn)]
  const weekDayHeaders: string[] = isMobileWeek
    ? days.map(d => format(d, 'EEE', { locale: dateFnsLocale(locale) }))
    : rotatedWeekday

  // Pre-compute Colombian holidays for the visible year range
  const holidays = useMemo(() => {
    const year = getYear(currentDate)
    return new Map([
      ...getColombiaHolidays(year - 1),
      ...getColombiaHolidays(year),
      ...getColombiaHolidays(year + 1),
    ])
  }, [getYear(currentDate)])

  const openAddAtTime = (start: string, end: string) => {
    setModalInitialTime({ start, end })
    setShowAddModal(true)
  }

  // ── Horizontal swipe → previous/next period (mobile) ─────────────────────────
  // Pull-to-refresh was removed (per tester feedback); only horizontal swipe
  // remains here, and it navigates the calendar by month / week / day based
  // on the current `mode` via the existing navigate() function.
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX
    const dy = e.changedTouches[0].clientY - touchStartY.current
    // Require a clearly-horizontal gesture so we don't hijack the day-detail
    // scroll: |dx| >= 60 and |dx| > |dy| * 1.3.
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.3) return
    navigate(dx > 0 ? 'next' : 'prev')
  }
  const closeModal = () => { setShowAddModal(false); setEditingActivity(null); setModalInitialTime(null); setModalInitialCategory(undefined) }

  // ── Shared day-detail panel props ────────────────────────────────────────────
  const detailProps = {
    date:             selectedDate,
    activities:       getActivitiesForDate(selectedDate),
    currentUserId:    currentUser?.id || '',
    currentUserColor: currentUser?.color || '#6366f1',
    allUsers,
    onAddActivity:    () => setShowAddModal(true),
    onEditActivity:   setEditingActivity,
    onActivityUpdated: fetchActivities,
    loading,
    openActivityId:       pendingOpen?.activityId ?? null,
    openActivityComments: pendingOpen?.openComments ?? false,
    onOpenActivityConsumed: () => setPendingOpen(null),
  }

  // ── Mobile day view (time grid, full screen) ──────────────────────────────
  if (isMobileDay) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <CalendarHeader
          currentDate={selectedDate}
          mode={mode}
          onNavigate={navigate}
          onToday={() => { const t = new Date(); setCurrentDate(t); setSelectedDate(t) }}
          onModeChange={m => { setMode(m) }}
          onJumpToDate={jumpToDate}
          userId={currentUser?.id}
        />
        {/* Filter chips — mobile day view used to skip this row, leaving no
            way to hide a co-sharer's activities from the time grid. The bar
            self-hides when allUsers.length <= 1 (solo user), so adding it
            here is a no-op for non-sharing accounts. */}
        <UserFilterBar
          users={allUsers} activeUserIds={activeUserIds}
          onToggleUser={id => setActiveUserIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          )}
        />
        <div
          className="flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div key={swipeAnimKey} className={cn('h-full', swipeAnimClass)}>
            <TimeGridView
              days={[selectedDate]}
              activities={activities}
              allUsers={allUsers}
              currentUserId={currentUser?.id}
              onEditActivity={setEditingActivity}
              onActivityUpdated={fetchActivities}
              onAddActivityAtTime={openAddAtTime}
            />
          </div>
        </div>

        {/* Floating action button — anchored above the bottom nav */}
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed right-4 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform animate-attention"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
          aria-label={t('calendar.newActivity')}
        >
          <Plus className="w-6 h-6" />
        </button>

        {(showAddModal || editingActivity) && (
          <ActivityFormModal
            date={selectedDate} activity={editingActivity} currentUser={currentUser}
            onClose={closeModal}
            onSaved={() => { closeModal(); fetchActivities() }}
            initialStartTime={modalInitialTime?.start}
            initialEndTime={modalInitialTime?.end}
            initialCategory={modalInitialCategory}
          />
        )}
      </div>
    )
  }

  // ── Mobile month / week view (compact grid + permanent day detail) ─────────
  // Portrait only — in landscape (short height) the compact grid + bottom
  // panel split crushes the activity list to zero rows, so we fall through
  // to the desktop right-side panel layout below.
  if (isMobilePortrait && (mode === 'month' || mode === 'week')) {
    const gridDays = mode === 'month' ? undefined : weekStripDays
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <CalendarHeader
          currentDate={isMobileWeek ? selectedDate : currentDate}
          mode={mode}
          onNavigate={navigate}
          onToday={() => { const t = new Date(); setCurrentDate(t); setSelectedDate(t) }}
          onModeChange={m => { setMode(m) }}
          onJumpToDate={jumpToDate}
          userId={currentUser?.id}
        />
        <UserFilterBar
          users={allUsers} activeUserIds={activeUserIds}
          onToggleUser={id => setActiveUserIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          )}
        />

        {/* Compact grid — swipeable on mobile. Hidden while the user is
            composing a comment so the keyboard-driven layout can't make
            the day-detail header overlap the calendar grid. */}
        {!composing && (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="shrink-0 border-b border-border" style={{
            height: (() => {
              if (mode !== 'month') return '25dvh'
              const rows = eachDayOfInterval({
                start: startOfWeek(startOfMonth(currentDate), { weekStartsOn }),
                end:   endOfWeek(endOfMonth(currentDate),   { weekStartsOn }),
              }).length / 7
              return rows >= 6 ? '28dvh' : rows >= 5 ? '25dvh' : '22dvh'
            })(),
          }}>
            <div key={swipeAnimKey} className={cn('h-full', swipeAnimClass)}>
              <CompactMonthGrid
                currentDate={mode === 'week' ? (isMobileWeek ? selectedDate : currentDate) : currentDate}
                selectedDate={selectedDate}
                days={gridDays}
                activities={activities}
                holidays={holidays}
                allUsers={allUsers}
                activeUserIds={activeUserIds}
                onDateSelect={d => { setSelectedDate(d); setCurrentDate(d) }}
              />
            </div>
          </div>
        )}

        {/* Day detail — remaining space, min-h-0 ensures flex child can shrink below content.
            Also handles horizontal swipe so users can navigate the calendar from
            anywhere on the screen, not just the compact grid up top. The handler
            ignores anything that's mostly vertical, so internal scrolling of the
            detail panel still works. */}
        <div
          className="flex-1 overflow-hidden flex flex-col min-h-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <DayDetailPanel {...detailProps} onComposingChange={setComposing} />
        </div>

        {/* Floating action button — anchored above the bottom nav. Hidden
            while composing so it doesn't cover the comment send button. */}
        {!composing && (
          <button
            onClick={() => setShowAddModal(true)}
            className="fixed right-4 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform animate-attention"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
            aria-label={t('calendar.newActivity')}
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {(showAddModal || editingActivity) && (
          <ActivityFormModal
            date={selectedDate} activity={editingActivity} currentUser={currentUser}
            onClose={closeModal}
            onSaved={() => { closeModal(); fetchActivities() }}
            initialStartTime={modalInitialTime?.start}
            initialEndTime={modalInitialTime?.end}
            initialCategory={modalInitialCategory}
          />
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full', useBottomPanel && mode !== 'day' ? 'flex-col' : 'flex-row')}>
      {/* Main calendar area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <CalendarHeader
          currentDate={isMobileWeek ? selectedDate : currentDate}
          mode={mode}
          onNavigate={navigate}
          onToday={() => {
            const today = new Date()
            setCurrentDate(today)
            setSelectedDate(today)
          }}
          onModeChange={setMode}
          onJumpToDate={jumpToDate}
          userId={currentUser?.id}
        />

        <UserFilterBar
          users={allUsers}
          activeUserIds={activeUserIds}
          onToggleUser={id =>
            setActiveUserIds(prev =>
              prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            )
          }
        />

        {/* Desktop day view — time grid */}
        {mode === 'day' && (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex-1 overflow-hidden">
            <div key={swipeAnimKey} className={cn('h-full', swipeAnimClass)}>
              <TimeGridView
                days={[selectedDate]}
                activities={activities}
                allUsers={allUsers}
                currentUserId={currentUser?.id}
                onEditActivity={setEditingActivity}
                onActivityUpdated={fetchActivities}
                onAddActivityAtTime={openAddAtTime}
              />
            </div>
          </div>
        )}

        {/* Calendar grid — month / week */}
        {mode !== 'day' && <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-auto p-1.5 sm:p-4">
          {/* Week day headers */}
          <div className={cn('grid mb-2', isMobileWeek ? 'grid-cols-3' : 'grid-cols-7')}>
            {weekDayHeaders.map((day, i) => (
              <div
                key={`${day}-${i}`}
                className="text-xs font-medium text-muted-foreground text-center py-1.5 capitalize"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div
            key={swipeAnimKey}
            className={cn(
              'grid gap-1 sm:gap-2',
              isMobileWeek ? 'grid-cols-3' : 'grid-cols-7',
              mode === 'week' && 'flex-1',
              swipeAnimClass,
            )}
          >
            {days.map(day => {
              const dayActivities = getActivitiesForDate(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isSelected     = isSameDay(day, selectedDate)
              const isTodayDate    = isToday(day)

              return (
                <DayCell
                  key={format(day, 'yyyy-MM-dd')}
                  date={day}
                  activities={dayActivities}
                  isCurrentMonth={isCurrentMonth}
                  isSelected={isSelected}
                  isToday={isTodayDate}
                  mode={mode}
                  currentUserId={currentUser?.id || ''}
                  allUsers={allUsers}
                  loading={loading}
                  holiday={holidays.get(format(day, 'yyyy-MM-dd'))}
                  onClick={() => { setSelectedDate(day) }}
                  onAddActivity={() => { setSelectedDate(day); setShowAddModal(true) }}
                  onEditActivity={setEditingActivity}
                  onActivityUpdated={fetchActivities}
                />
              )
            })}
          </div>
        </div>}
      </div>

      {/* ── Detail panel — bottom on tablet portrait, right side on desktop
          and tablet landscape (phones rotated to landscape end up in the
          tablet width range but the bottom panel crushes the activity
          list on a short screen). ── */}
      {mode !== 'day' && (
        useBottomPanel ? (
          // 50dvh leaves enough vertical room to actually read a day's
          // activity list on tablet portrait — the previous 35dvh was
          // almost entirely consumed by the panel header + progress bar,
          // hiding the activities the user came to see.
          <div className="shrink-0 border-t border-border overflow-hidden" style={{ height: '50dvh' }}>
            <DayDetailPanel {...detailProps} />
          </div>
        ) : (
          // Right-side panel — used on desktop AND on landscape phones /
          // tablets where the bottom-panel split would crush the activity
          // list. Width steps down on narrower viewports so the calendar
          // grid still has room (w-64 on mobile landscape, w-80 from md+).
          <div className="flex w-64 md:w-80 shrink-0 border-l border-border">
            <DayDetailPanel {...detailProps} />
          </div>
        )
      )}

      {/* Add/Edit Activity Modal */}
      {(showAddModal || editingActivity) && (
        <ActivityFormModal
          date={selectedDate}
          activity={editingActivity}
          currentUser={currentUser}
          initialStartTime={modalInitialTime?.start}
          initialEndTime={modalInitialTime?.end}
          initialCategory={modalInitialCategory}
          onClose={closeModal}
          onSaved={() => { closeModal(); fetchActivities() }}
        />
      )}
    </div>
  )
}
