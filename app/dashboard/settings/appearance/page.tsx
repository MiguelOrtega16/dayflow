'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Crown, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { USER_COLORS, isProColor, getInitials } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { useTheme } from '@/components/layout/theme-provider'
import { useBackButtonRoute } from '@/lib/back-button'
import { THEMES, isProTheme } from '@/lib/themes'
import { updateUserPreferences } from '@/lib/user-preferences'
import type { Profile } from '@/types'

export default function AppearanceSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [color, setColor] = useState('#6366f1')
  const [savingColor, setSavingColor] = useState(false)
  const { entitlement, loading: entitlementLoading } = useEntitlement(profile?.id ?? null)
  const { open: openPaywall } = usePaywall()
  const { palette, setPalette } = useTheme()

  // Android hardware back routes to the main settings page instead of
  // showing the quit-app confirm dialog.
  useBackButtonRoute(() => router.push('/dashboard/settings'))

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
      setColor(data.color || '#6366f1')
    }
  }

  // Profile color click. Pro colors for free users open the paywall;
  // otherwise we apply optimistically and persist immediately (no Save
  // button on this page — clicks are auto-saved like the theme picker).
  // On DB-trigger rejection (race: user lost Pro between client check
  // and write), revert and surface the paywall as a fallback.
  const handleColorClick = async (c: string) => {
    if (!profile) return
    if (c === color) return
    if (isProColor(c) && !entitlement.isPro) {
      openPaywall('locked_color')
      return
    }
    const prev = color
    setColor(c)
    setSavingColor(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ color: c })
        .eq('id', profile.id)
      if (error) {
        setColor(prev)
        const msg = String(error.message || '')
        if (error.code === '42501' || msg.includes('Pro color')) {
          openPaywall('locked_color')
        } else {
          console.error('[appearance] color save failed', error)
        }
      }
    } finally {
      setSavingColor(false)
    }
  }

  const handlePaletteClick = async (id: string) => {
    if (!profile) return
    if (id === palette) return
    if (isProTheme(id) && !entitlement.isPro) {
      openPaywall('locked_theme')
      return
    }
    const prev = palette
    setPalette(id)
    try {
      await updateUserPreferences(profile.id, { theme: id })
    } catch (err: any) {
      setPalette(prev)
      const code = err?.code
      const msg  = String(err?.message ?? '')
      if (code === '42501' || msg.includes('Pro theme')) {
        openPaywall('locked_theme')
      } else {
        console.error('[appearance] palette save failed', err)
      }
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push('/dashboard/settings')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('settings.appearanceBack')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('settings.appearanceSection')}</h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Live avatar preview so the color change is visible without
            scrolling back to find the avatar on the main settings page. */}
        <div className="flex items-center gap-4 px-1">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white transition-colors"
            style={{ backgroundColor: color }}
          >
            {profile?.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full rounded-2xl object-cover" alt="" />
              : getInitials(profile?.full_name ?? '', profile?.email)
            }
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{profile?.full_name || profile?.email}</p>
            <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">{t('settings.appearanceSection')}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t('settings.appearanceHelp')}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">{t('settings.profileColorLabel')}</label>
            <p className="text-[11px] text-muted-foreground/80 mb-2">{t('settings.profileColorHelp')}</p>
            <div className="flex flex-wrap gap-2">
              {USER_COLORS.map(c => {
                const isPro  = isProColor(c)
                const locked = isPro && !!profile && !entitlementLoading && !entitlement.isPro
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColorClick(c)}
                    disabled={savingColor}
                    className="relative w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-60"
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

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">{t('settings.themeLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(p => {
                const locked   = !p.free && !!profile && !entitlementLoading && !entitlement.isPro
                const selected = palette === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePaletteClick(p.id)}
                    className={`relative flex items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full shrink-0 border border-black/5"
                      style={{ backgroundColor: p.swatch }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium truncate">
                        {t(`settings.themePalettes.${p.i18nKey}`)}
                      </span>
                    </span>
                    {selected && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    {locked && (
                      <Crown className="absolute -top-1 -right-1 w-3.5 h-3.5 text-indigo-500 bg-background rounded-full p-[1px]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
