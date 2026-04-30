'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  const [isMobile, setIsMobile] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    if (window.innerWidth < 768) setMode('week')
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Build list of all visible users
  const allUsers: { profile: Profile; isOwn: boolean }[] = []
  if (currentUser) allUsers.push({ profile: currentUser, isOwn: true })
  sharedCalendars.forEach(sc => {
    if (sc.owner_id === currentUser?.id && sc.shared_with) {
      allUsers.push({ profile: sc.shared_with, isOwn: false })
    } else if (sc.shared_with_id === currentUser?.id && sc.owner) {
      allUsers.push({ profile: sc.owner, isOwn: false })
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
      const data = await getActivitiesForRange(start, end, activeUserIds)
      setActivities(data)
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }, [getDateRange, activeUserIds])

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
    const onRefresh = () => fetchActivities()
    window.addEventListener('dayflow:refresh', onRefresh)
    return () => window.removeEventListener('dayflow:refresh', onRefresh)
  }, [fetchActivities])

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
      const next = addDays(selectedDate, d * 3)
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
        <div className="flex-1 overflow-hidden">
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

        {/* Compact grid — top 25% */}
        <div className="shrink-0 border-b border-border" style={{ height: '25dvh' }}>
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
    <div className="flex h-full">
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
          <div className="flex-1 overflow-hidden">
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
        {mode !== 'day' && <div className="flex-1 overflow-auto p-1.5 sm:p-4">
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

      {/* ── Desktop: right-side detail panel — hidden in day mode ── */}
      {mode !== 'day' && <div className="hidden md:flex w-80 shrink-0 border-l border-border">
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
      </div>}

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
