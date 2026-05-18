'use client'

import { useState, useEffect } from 'react'
import { Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { USER_COLORS, FREE_USER_COLORS, isProColor, getInitials } from '@/lib/utils'
import { useI18n, LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n'
import { CustomSelect } from '@/components/ui/custom-select'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import type { Profile } from '@/types'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { entitlement } = useEntitlement(profile?.id ?? null)
  const { open: openPaywall } = usePaywall()

  const handleColorClick = (c: string) => {
    if (isProColor(c) && !entitlement.isPro) {
      openPaywall('locked_theme')
      return
    }
    setColor(c)
  }

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
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username: username || null, color })
      .eq('id', profile.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      return
    }
    // The check_profile_color trigger raises 42501 when a free user tries to
    // pick a Pro color through a bypass route — open the paywall as fallback.
    const msg = String(error.message || '')
    if (error.code === '42501' || msg.includes('Pro color')) {
      openPaywall('locked_theme')
    } else {
      console.error('[settings] save failed', error)
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

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('settings.colorLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {USER_COLORS.map(c => {
                const isPro = isProColor(c)
                const locked = isPro && !entitlement.isPro
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColorClick(c)}
                    className="relative w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? 'white' : c,
                      outline: color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                    }}
                  >
                    {locked && (
                      <Crown className="absolute -top-1 -right-1 w-3 h-3 text-indigo-500 bg-background rounded-full p-[1px]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Language section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold">{t('settings.languageSection')}</h2>
          <p className="text-xs text-muted-foreground">{t('settings.languageHelp')}</p>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('settings.languageLabel')}</label>
            <CustomSelect<Locale>
              value={locale}
              onChange={(v) => setLocale(v)}
              options={LOCALES.map(l => ({ value: l, label: LOCALE_NAMES[l] }))}
              ariaLabel={t('settings.languageLabel')}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-border">
        <button
          onClick={handleSignOut}
          className="text-sm text-destructive hover:underline font-medium"
        >
          {t('settings.signOut')}
        </button>
      </div>
    </div>
  )
}
