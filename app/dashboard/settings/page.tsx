'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, LayoutPanelTop, Bell, LogOut, Languages, Palette } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { useI18n, LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n'
import { CustomSelect } from '@/components/ui/custom-select'
import type { Profile } from '@/types'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  // Color is read-only here — managed on the Appearance sub-page now.
  // We still load it for the avatar preview at the top of this page.
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data)
      setFullName(data.full_name || '')
      setUsername(data.username || '')
      setColor(data.color || '#6366f1')
    }
    // Palette is synced globally by ThemeProvider's auth-state listener —
    // no need to fetch it here.
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username: username || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      console.error('[settings] save failed', error)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Avatar preview */}
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

        {/* Profile info — identity fields only. The color (visual identity)
            lives under Appearance now since it pairs naturally with the
            accent theme. */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">{t('settings.profileSection')}</h2>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('settings.fullName')}</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('settings.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('settings.usernamePlaceholder')}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Customize section — navigation rows to sub-pages plus the
            language selector (inline since it's a single dropdown, not a
            full sub-page). Widget is native-only since the widget config
            only does anything inside the Android app. Appearance is here
            (not inline above) so users can deep-link to it and the
            hardware back button has a clear "return to settings" target. */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <h2 className="text-sm font-semibold px-5 pt-5 pb-3">{t('settings.personalizeSection')}</h2>

          <SettingsNavRow
            icon={<Palette className="w-5 h-5 text-primary" />}
            title={t('settings.appearanceRow.label')}
            sub={t('settings.appearanceRow.sub')}
            onClick={() => router.push('/dashboard/settings/appearance')}
          />

          {isNative && (
            <SettingsNavRow
              icon={<LayoutPanelTop className="w-5 h-5 text-primary" />}
              title={t('settings.widgetRow.label')}
              sub={t('settings.widgetRow.sub')}
              onClick={() => router.push('/dashboard/widgets')}
            />
          )}

          <SettingsNavRow
            icon={<Bell className="w-5 h-5 text-primary" />}
            title={t('settings.notificationsRow.label')}
            sub={t('settings.notificationsRow.sub')}
            onClick={() => router.push('/dashboard/settings/notifications')}
          />

          {/* Language row — inline select, no chevron, no sub-page. */}
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="shrink-0"><Languages className="w-5 h-5 text-primary" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{t('settings.languageLabel')}</span>
              <span className="block text-xs text-muted-foreground truncate">{t('settings.languageHelp')}</span>
            </span>
            <div className="shrink-0 w-32">
              <CustomSelect<Locale>
                value={locale}
                onChange={(v) => setLocale(v)}
                options={LOCALES.map(l => ({ value: l, label: LOCALE_NAMES[l] }))}
                ariaLabel={t('settings.languageLabel')}
              />
            </div>
          </div>
        </div>

        {/* Primary Save button — full-width, padded to feel like the canonical
            commit-changes action for the whole form above. */}
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.save')}
        </button>
      </form>

      {/* Account section — sign-out lives here in its own clearly-labeled
          card with destructive styling + inline confirmation, so it's hard
          to fire accidentally. */}
      <div className="mt-8 bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">{t('settings.accountSection')}</h2>

        {confirmingSignOut ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
            <p className="text-sm text-foreground">{t('settings.signOutConfirm')}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingSignOut(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
              >
                {t('settings.signOutConfirmYes')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingSignOut(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left text-sm font-medium">{t('settings.signOut')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── SettingsNavRow — list-row link to a sub-settings page ──────────────────
function SettingsNavRow({
  icon, title, sub, onClick, isLast,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onClick: () => void
  isLast?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors ${
        isLast ? '' : 'border-b border-border'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground truncate">{sub}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  )
}
