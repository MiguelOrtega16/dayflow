'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchUsers, shareCalendar, removeCalendarShare, getSharedCalendarUsers, respondToCalendarShare } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'
import { Search, UserPlus, X, Check, Users, Clock, CheckCircle2, XCircle } from 'lucide-react'
import type { Profile, SharedCalendar } from '@/types'

export default function PeoplePage() {
  const [currentUser, setCurrentUser]       = useState<Profile | null>(null)
  const [sharedCalendars, setSharedCalendars] = useState<SharedCalendar[]>([])
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchResults, setSearchResults]   = useState<Profile[]>([])
  const [searching, setSearching]           = useState(false)
  const [loading, setLoading]               = useState(true)
  const [responding, setResponding]         = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  // Real-time: reload when any calendar share involving this user changes
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
  }, [currentUser?.id])

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      if (!currentUser) return
      setSearching(true)
      try {
        const results = await searchUsers(searchQuery, currentUser.id)
        setSearchResults(results || [])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(t)
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
    await shareCalendar(currentUser.id, targetUser.id)
    setSearchQuery('')
    setSearchResults([])
    loadData()
  }

  const handleRemove = async (shareId: string) => {
    await removeCalendarShare(shareId)
    loadData()
  }

  const handleRespond = async (shareId: string, accept: boolean) => {
    if (!currentUser) return
    setResponding(shareId)
    try {
      await respondToCalendarShare(shareId, accept, currentUser.id)
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

  const STATUS_LABEL: Record<string, string> = {
    pending:  'Esperando respuesta',
    accepted: 'Compartido',
    declined: 'Declinó',
  }
  const STATUS_COLOR: Record<string, string> = {
    pending:  'text-amber-600 dark:text-amber-400',
    accepted: 'text-emerald-600 dark:text-emerald-400',
    declined: 'text-red-500 dark:text-red-400',
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Personas</h1>
        <p className="text-muted-foreground">Comparte tu calendario y ve las actividades de otros</p>
      </div>

      {/* ── Invitaciones entrantes pendientes ── */}
      {pendingIncoming.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5 mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4" /> Invitaciones de calendario pendientes
            <span className="ml-auto text-xs font-normal">{pendingIncoming.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingIncoming.map(sc => {
              const owner = sc.owner as Profile
              return (
                <div key={sc.id} className="flex items-center gap-3 bg-background/60 rounded-xl p-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: owner?.color || '#6366f1' }}>
                    {owner?.avatar_url
                      ? <img src={owner.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(owner?.full_name, owner?.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{owner?.full_name || owner?.username || 'Desconocido'}</p>
                    <p className="text-xs text-muted-foreground">{owner?.email}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">quiere compartir su calendario contigo</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRespond(sc.id, true)}
                      disabled={responding === sc.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aceptar
                    </button>
                    <button
                      onClick={() => handleRespond(sc.id, false)}
                      disabled={responding === sc.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Declinar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Buscar y compartir ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> Comparte tu calendario
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Busca por nombre, usuario o correo..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 border border-border rounded-xl overflow-hidden">
            {searchResults.map(user => {
              const already = isAlreadyShared(user.id)
              return (
                <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: user.color }}>
                    {user.avatar_url
                      ? <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                      : getInitials(user.full_name, user.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.full_name || user.username || 'Desconocido'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => !already && handleShare(user)}
                    disabled={already}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      already ? 'bg-muted text-muted-foreground cursor-default' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    {already ? <><Check className="w-3 h-3" /> Enviado</> : <><UserPlus className="w-3 h-3" /> Compartir</>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {searching && <p className="text-xs text-muted-foreground mt-2 px-1">Buscando...</p>}
      </div>

      {/* ── Compartidos por mí ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Compartido con
          <span className="ml-auto text-xs text-muted-foreground font-normal">{myShares.length} personas</span>
        </h2>
        {myShares.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has compartido tu calendario con nadie.</p>
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
                    <p className="text-sm font-medium">{user?.full_name || user?.username || 'Desconocido'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <p className={cn('text-xs font-medium mt-0.5', STATUS_COLOR[sc.status || 'pending'])}>
                      {STATUS_LABEL[sc.status || 'pending']}
                    </p>
                  </div>
                  <button onClick={() => handleRemove(sc.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Eliminar">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Calendarios que veo (aceptados) ── */}
      {acceptedIncoming.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold mb-3">
            Calendarios visibles para mí
            <span className="ml-2 text-xs text-muted-foreground font-normal">{acceptedIncoming.length} personas</span>
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
                    <p className="text-sm font-medium">{owner?.full_name || owner?.username || 'Desconocido'}</p>
                    <p className="text-xs text-muted-foreground">{owner?.email}</p>
                  </div>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Viendo</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
