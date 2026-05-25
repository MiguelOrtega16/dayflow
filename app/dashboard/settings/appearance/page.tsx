'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Crown, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { USER_COLORS, isProColor, getInitials, CATEGORY_CONFIG, categoryLabel } from '@/lib/utils'
import type { ActivityCategory } from '@/types'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { useTheme } from '@/components/layout/theme-provider'
import { useBackButtonRoute } from '@/lib/back-button'
import { useSwipeBack } from '@/lib/swipe-back'
import { THEMES, isProTheme } from '@/lib/themes'
import { normalizePreferences, updateUserPreferences } from '@/lib/user-preferences'
import { useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

// Categories shown in the per-category color picker — matches what users
// can pick in the activity-form type chooser. 'note' is filtered out of
// creation, so we don't expose customization for it either (any existing
// note activities keep the CATEGORY_CONFIG.note default).
const PICKER_CATEGORIES: readonly ActivityCategory[] = ['task', 'habit', 'event', 'reminder']

export default function AppearanceSettingsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  // Profile comes from the dashboard layout's server fetch via context —
  // no remount fetch when navigating back into / out of this page.
  const { profile, setProfile } = useProfile()
  const color = profile?.color || '#6366f1'
  const [savingColor, setSavingColor] = useState(false)
  const { entitlement, loading: entitlementLoading } = useEntitlement(profile?.id ?? null)
  const { open: openPaywall } = usePaywall()
  const { palette, setPalette } = useTheme()

  // Android hardware back routes to the main settings page instead of
  // showing the quit-app confirm dialog.
  useBackButtonRoute(() => router.push('/dashboard/settings'))
  const swipeRef = useSwipeBack(() => router.push('/dashboard/settings'))

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
    const prev = profile
    // Optimistically push into the shared cache so the sidebar avatar updates
    // immediately along with this page's swatch ring.
    setProfile({ ...profile, color: c })
    setSavingColor(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ color: c })
        .eq('id', profile.id)
      if (error) {
        setProfile(prev)
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

  // Pro toggle: "color my activities by category" — flips day_view_color_by
  // through the shared profile cache so day-detail-panel + time-grid pick up
  // the change instantly. Reverts on save failure.
  const prefs = normalizePreferences(profile?.preferences ?? null)
  const colorByCategory = prefs.day_view_color_by === 'category'
  const categoryOverrides = prefs.category_color_overrides
  const handleColorModeToggle = async () => {
    if (!profile) return
    if (!colorByCategory && !entitlement.isPro) {
      openPaywall('locked_color_mode')
      return
    }
    const nextMode = colorByCategory ? 'profile' : 'category'
    const prevPrefs = profile.preferences as Record<string, unknown> | null
    setProfile({ ...profile, preferences: { ...(prevPrefs ?? {}), day_view_color_by: nextMode } })
    try {
      await updateUserPreferences(profile.id, { day_view_color_by: nextMode })
    } catch (err) {
      console.error('[appearance] color-mode save failed', err)
      setProfile({ ...profile, preferences: prevPrefs })
    }
  }

  // Per-category override write. `hex === null` means "reset to the
  // CATEGORY_CONFIG default" — implemented by dropping the key from the
  // overrides object so future renders fall through the resolver's chain.
  // Same optimistic-update + rollback pattern as the toggle.
  const handleCategoryColor = async (cat: ActivityCategory, hex: string | null) => {
    if (!profile) return
    const prevPrefs = profile.preferences as Record<string, unknown> | null
    const nextOverrides: Partial<Record<ActivityCategory, string>> = { ...categoryOverrides }
    if (hex === null) delete nextOverrides[cat]
    else nextOverrides[cat] = hex
    setProfile({ ...profile, preferences: { ...(prevPrefs ?? {}), category_color_overrides: nextOverrides } })
    try {
      await updateUserPreferences(profile.id, { category_color_overrides: nextOverrides })
    } catch (err) {
      console.error('[appearance] category-color save failed', err)
      setProfile({ ...profile, preferences: prevPrefs })
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
    <div ref={swipeRef} className="flex flex-col h-full overflow-y-auto bg-background">
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

          {/* Pro: color activities by category instead of by owner. Pairs with
              the per-category hex map in CATEGORY_CONFIG; activity cards in
              the Day list + time-grid blocks pick up the change in real time
              via the shared profile cache. Free users see a Crown + paywall. */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground">{t('settings.colorModeLabel')}</label>
            <p className="text-[11px] text-muted-foreground/80 mb-2">{t('settings.colorModeHelp')}</p>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{t('settings.colorModeOptionLabel')}</span>
                <span className="block text-xs text-muted-foreground">
                  {colorByCategory ? t('settings.colorModeOnHint') : t('settings.colorModeOffHint')}
                </span>
              </span>
              {!entitlement.isPro && !entitlementLoading && (
                <Crown className="w-4 h-4 text-indigo-500 shrink-0" />
              )}
              <button
                type="button"
                role="switch"
                aria-checked={colorByCategory}
                onClick={handleColorModeToggle}
                className={cn(
                  'shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  colorByCategory ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                    colorByCategory ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>

            {/* Per-category color picker: only meaningful when the toggle is
                on (otherwise the override never feeds into activityColor()),
                so we hide it entirely in 'profile' mode rather than show
                inert rows. Pro is already enforced by the toggle gate above. */}
            {colorByCategory && entitlement.isPro && (
              <div className="mt-3 space-y-2 rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[11px] text-muted-foreground">{t('settings.categoryColorsHelp')}</p>
                {PICKER_CATEGORIES.map(cat => {
                  const current = categoryOverrides[cat] ?? CATEGORY_CONFIG[cat].hex
                  const isOverridden = !!categoryOverrides[cat]
                  return (
                    <div key={cat} className="flex items-center gap-2 flex-wrap">
                      <span className="text-base shrink-0">{CATEGORY_CONFIG[cat].emoji}</span>
                      <span className="text-xs font-medium w-16 shrink-0">{categoryLabel(cat, locale)}</span>
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {USER_COLORS.map(c => (
                          <button key={c}
                            type="button"
                            aria-label={c}
                            onClick={() => handleCategoryColor(cat, c)}
                            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: current === c ? 'white' : c,
                              outline: current === c ? `2px solid ${c}` : 'none',
                              outlineOffset: '1px',
                            }}
                          />
                        ))}
                      </div>
                      {isOverridden && (
                        <button type="button"
                          onClick={() => handleCategoryColor(cat, null)}
                          className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 underline-offset-2 hover:underline"
                        >
                          {t('settings.resetCategoryColor')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">{t('settings.themeLabel')}</label>
            {/* Drop to 2 columns on narrow phones so the theme name doesn't get
                truncated next to the swatch + check icon. Three columns is fine
                from `sm` upwards (>=640px). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
