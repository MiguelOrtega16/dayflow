'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, getYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { getActivitiesForRange } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getColombiaHolidays } from '@/lib/holidays'
import type { Activity, Profile } from '@/types'
import { DayCell } from './day-cell'
import { DayDetailPanel } from './day-detail-panel'
import { CalendarHeader } from './calendar-header'
import { UserFilterBar } from './user-filter-bar'
import { ActivityFormModal } from '../activities/activity-form-modal'
import { scheduleActivityReminders } from '@/lib/activity-reminders'
import { CompactMonthGrid } from './compact-month-grid'
import { TimeGridView } from './time-grid-view'

type CalendarMode = 'month' | 'week' | 'day'

interface CalendarViewProps {
  currentUser: Profile | null
  sharedCalendars: any[]
}

export function CalendarView({ currentUser, sharedCalendars }: CalendarViewProps) {
  // Use client-side new Date() so the initial day reflects the user's local timezone,
  // not the server's UTC date (which can differ by a day near midnight).
  const [currentDate, setCurrentDate]   = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [mode, setMode]                 = useState<CalendarMode>('month')
  const [activities, setActivities]     = useState<Activity[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [modalInitialTime, setModalInitialTime] = useState<{ start: string; end: string } | null>(null)
  const [activeUserIds, setActiveUserIds] = useState<string[]>([])
  // Detected client-side after hydration; starts false (SSR-safe)
  const [isMobile, setIsMobile]   = useState(false)
  // Tablet: 768–1279 px — uses bottom panel instead of right-side panel
  const [isTablet, setIsTablet]   = useState(false)
  // Live copy of shared calendars — the server prop is static; this refreshes in real-time
  const [liveSharedCalendars, setLiveSharedCalendars] = useState(sharedCalendars)
  const supabase = createClient()

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1280)
      if (w < 768) setMode('week')
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
  liveSharedCalendars.forEach((sc: any) => {
    let profile: Profile | null = null
    if (sc.owner_id === currentUser?.id && sc.shared_with) {
      profile = sc.shared_with
    } else if (sc.shared_with_id === currentUser?.id && sc.owner) {
      profile = sc.owner
    }
    if (profile && !seenUserIds.has(profile.id)) {
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
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
      const end   = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
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
      const start = startOfWeek(currentDate, { weekStartsOn: 0 })
      const end   = endOfWeek(currentDate, { weekStartsOn: 0 })
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
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }, [getDateRange, activeUserIds, currentUser?.id])

  useEffect(() => { fetchActivities() }, [fetchActivities])

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

  // Pick up a date stored by push-notification deep links (fires after full-page reload)
  useEffect(() => {
    const gotoDate = sessionStorage.getItem('dayflow:gotoDate')
    if (!gotoDate) return
    sessionStorage.removeItem('dayflow:gotoDate')
    const d = new Date(gotoDate + 'T12:00:00')
    setCurrentDate(d)
    setSelectedDate(d)
  }, [])

  const getDaysForView = (): Date[] => {
    if (mode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
      const end   = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
      return eachDayOfInterval({ start, end })
    } else if (mode === 'day') {
      return [selectedDate]
    } else if (isMobileWeek) {
      return [subDays(selectedDate, 1), selectedDate, addDays(selectedDate, 1)]
    } else {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 })
      const end   = endOfWeek(currentDate, { weekStartsOn: 0 })
      return eachDayOfInterval({ start, end })
    }
  }

  // Days for the compact week strip (always 7)
  const weekStripDays = eachDayOfInterval({
    start: startOfWeek(isMobileWeek ? selectedDate : currentDate, { weekStartsOn: 0 }),
    end:   endOfWeek(isMobileWeek ? selectedDate : currentDate, { weekStartsOn: 0 }),
  })

  const getActivitiesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return activities.filter(a => a.date === dateStr)
  }

  const navigate = (direction: 'prev' | 'next') => {
    const d = direction === 'next' ? 1 : -1
    if (mode === 'month') {
      setCurrentDate(d > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    } else if (mode === 'day') {
      const next = addDays(selectedDate, d)
      setSelectedDate(next); setCurrentDate(next)
    } else if (isMobileWeek) {
      const next = addDays(selectedDate, d * 7)
      setSelectedDate(next); setCurrentDate(next)
    } else {
      setCurrentDate(d > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    }
  }

  const days = getDaysForView()

  // Week day headers — 7 fixed labels for month/desktop week, dynamic 3 for mobile week
  const weekDayHeaders: string[] = isMobileWeek
    ? days.map(d => format(d, 'EEE', { locale: es }))
    : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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

  // ── Swipe + pull-to-refresh gesture handling (mobile) ────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX
    const rawDy = e.changedTouches[0].clientY - touchStartY.current  // positive = pulled down
    const absDy = Math.abs(rawDy)

    // Pull-to-refresh: downward drag > 80px, mostly vertical
    if (rawDy > 80 && absDy > Math.abs(dx) * 1.5) {
      setRefreshing(true)
      fetchActivities().finally(() => setRefreshing(false))
      return
    }

    // Horizontal swipe — ignore vertical scrolling
    if (Math.abs(dx) < 50 || absDy > 80) return
    navigate(dx > 0 ? 'next' : 'prev')
  }
  const closeModal = () => { setShowAddModal(false); setEditingActivity(null); setModalInitialTime(null) }

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
          onAddActivity={() => setShowAddModal(true)}
          userId={currentUser?.id}
        />
        <div
          className="flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
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
        {(showAddModal || editingActivity) && (
          <ActivityFormModal
            date={selectedDate} activity={editingActivity} currentUser={currentUser}
            onClose={closeModal}
            onSaved={() => { closeModal(); fetchActivities() }}
            initialStartTime={modalInitialTime?.start}
            initialEndTime={modalInitialTime?.end}
          />
        )}
      </div>
    )
  }

  // ── Mobile month / week view (compact grid + permanent day detail) ─────────
  if (isMobile && (mode === 'month' || mode === 'week')) {
    const gridDays = mode === 'month' ? undefined : weekStripDays
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <CalendarHeader
          currentDate={isMobileWeek ? selectedDate : currentDate}
          mode={mode}
          onNavigate={navigate}
          onToday={() => { const t = new Date(); setCurrentDate(t); setSelectedDate(t) }}
          onModeChange={m => { setMode(m) }}
          onAddActivity={() => setShowAddModal(true)}
          userId={currentUser?.id}
        />
        <UserFilterBar
          users={allUsers} activeUserIds={activeUserIds}
          onToggleUser={id => setActiveUserIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          )}
        />

        {/* Pull-to-refresh indicator */}
        {refreshing && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground bg-muted/40 animate-pulse">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Actualizando…
          </div>
        )}

        {/* Compact grid — swipeable on mobile */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 border-b border-border" style={{
          height: (() => {
            if (mode !== 'month') return '25dvh'
            const rows = eachDayOfInterval({
              start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
              end:   endOfWeek(endOfMonth(currentDate),   { weekStartsOn: 0 }),
            }).length / 7
            return rows >= 6 ? '32dvh' : rows >= 5 ? '28dvh' : '25dvh'
          })(),
        }}>
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

        {/* Day detail — remaining ~75% */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <DayDetailPanel {...detailProps} />
        </div>

        {(showAddModal || editingActivity) && (
          <ActivityFormModal
            date={selectedDate} activity={editingActivity} currentUser={currentUser}
            onClose={closeModal}
            onSaved={() => { closeModal(); fetchActivities() }}
            initialStartTime={modalInitialTime?.start}
            initialEndTime={modalInitialTime?.end}
          />
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full', isTablet && mode !== 'day' ? 'flex-col' : 'flex-row')}>
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
          onAddActivity={() => setShowAddModal(true)}
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
            className={cn(
              'grid gap-1 sm:gap-2',
              isMobileWeek ? 'grid-cols-3' : 'grid-cols-7',
              mode === 'week' && 'flex-1'
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

      {/* ── Detail panel — bottom on tablet, right side on desktop ── */}
      {mode !== 'day' && (
        isTablet ? (
          <div className="shrink-0 border-t border-border overflow-hidden" style={{ height: '35dvh' }}>
            <DayDetailPanel
              date={selectedDate}
              activities={getActivitiesForDate(selectedDate)}
              currentUserId={currentUser?.id || ''}
              currentUserColor={currentUser?.color || '#6366f1'}
              allUsers={allUsers}
              onAddActivity={() => setShowAddModal(true)}
              onEditActivity={setEditingActivity}
              onActivityUpdated={fetchActivities}
            />
          </div>
        ) : (
          <div className="hidden md:flex w-80 shrink-0 border-l border-border">
            <DayDetailPanel
              date={selectedDate}
              activities={getActivitiesForDate(selectedDate)}
              currentUserId={currentUser?.id || ''}
              currentUserColor={currentUser?.color || '#6366f1'}
              allUsers={allUsers}
              onAddActivity={() => setShowAddModal(true)}
              onEditActivity={setEditingActivity}
              onActivityUpdated={fetchActivities}
            />
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
          onClose={() => { setShowAddModal(false); setEditingActivity(null) }}
          onSaved={() => { setShowAddModal(false); setEditingActivity(null); fetchActivities() }}
        />
      )}
    </div>
  )
}
