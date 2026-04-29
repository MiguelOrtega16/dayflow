'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { USER_COLORS, getInitials } from '@/lib/utils'
import type { Profile } from '@/types'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data)
      setFullName(data.full_name || '')
      setUsername(data.username || '')
      setBio(data.bio || '')
      setColor(data.color || '#6366f1')
      setEmailNotifications(data.email_notifications ?? true)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username: username || null, bio: bio || null, color, email_notifications: emailNotifications })
      .eq('id', profile.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Configuración</h1>
        <p className="text-muted-foreground">Gestiona tu perfil y preferencias</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Vista previa del avatar */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {profile?.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full rounded-2xl object-cover" alt="" />
              : getInitials(fullName, profile?.email)
            }
          </div>
          <div>
            <p className="font-medium">{fullName || profile?.email}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Información de perfil</h2>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nombre de usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="tu_usuario"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Biografía</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Cuéntanos un poco sobre ti..."
              rows={2}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color de calendario</label>
            <div className="flex flex-wrap gap-2">
              {USER_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : c,
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Email notifications */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notificaciones por correo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recibe un email cuando alguien te invite a una actividad o comparta su calendario contigo
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEmailNotifications(p => !p)}
              className="relative shrink-0 ml-4"
              aria-checked={emailNotifications}
              role="switch"
            >
              <div className={`w-10 h-5 rounded-full transition-colors ${emailNotifications ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${emailNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : saved ? '✓ ¡Guardado!' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-border">
        <button
          onClick={handleSignOut}
          className="text-sm text-destructive hover:underline font-medium"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
