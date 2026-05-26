'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, LayoutPanelTop, Bell, LogOut, Languages, Palette, Clock, Crown, Eye, Lock, Sun, Moon } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn, getInitials } from '@/lib/utils'
import { useI18n, LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n'
import { CustomSelect } from '@/components/ui/custom-select'
import { normalizePreferences, updateUserPreferences } from '@/lib/user-preferences'
import { useProfile } from '@/lib/profile-context'
import { markDiscoverySeen } from '@/lib/onboarding/discovery-dots'
import { useTheme } from '@/components/layout/theme-provider'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/analytics/posthog'

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  // Profile comes from the dashboard layout's server-side fetch via context,
  // so back-nav from any sub-page renders instantly with the data already
  // in hand — no remount fetch, no blank-form flash.
  const { profile, setProfile } = useProfile()
  const { theme, setTheme } = useTheme()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const color = profile?.color || '#6366f1'
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  // Read directly off the cached profile.preferences jsonb — no extra fetch.
  const defaultPublic = normalizePreferences(profile?.preferences ?? null).default_activity_public
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  // First-run discovery: visiting Settings clears its sidebar dot.
  useEffect(() => {
    if (profile?.id) markDiscoverySeen(profile, setProfile, 'settings')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Sync local form state if the cached profile gets replaced (e.g. another
  // dashboard surface called refresh()). Skipped on first mount because
  // useState already seeded the values above.
  useEffect(() => {
    setFullName(profile?.full_name || '')
    setUsername(profile?.username || '')
  }, [profile?.id])

  // Persist the visibility default immediately on toggle. Optimistic update
  // goes through the shared profile cache so every consumer (sidebar, other
  // pages) sees the new value without a fetch. Reverts on failure.
  const handleDefaultPublicChange = async (next: boolean) => {
    if (!profile) return
    const prevPrefs = profile.preferences as Record<string, unknown> | null
    setProfile({ ...profile, preferences: { ...(prevPrefs ?? {}), default_activity_public: next } })
    try {
      await updateUserPreferences(profile.id, { default_activity_public: next })
    } catch (err) {
      console.error('[settings] default visibility save failed', err)
      setProfile({ ...profile, preferences: prevPrefs })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const nextUsername = username || null
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username: nextUsername })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      console.error('[settings] save failed', error)
      return
    }
    // Push the new identity into the shared cache so the sidebar avatar
    // label updates without a roundtrip.
    setProfile({ ...profile, full_name: fullName, username: nextUsername })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSignOut = async () => {
    track('user_logged_out')
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

        {/* Plan & Billing — separate card so it stands out above the
            personalize section. Crown icon to match the Pro/paywall
            visual language; tapping opens the full billing sub-page
            where users see their current plan, the Free vs Pro
            comparison table, and the manage/upgrade actions. */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <SettingsNavRow
            icon={<Crown className="w-5 h-5 text-indigo-500" />}
            title={t('settings.billingRow.label')}
            sub={t('settings.billingRow.sub')}
            href="/dashboard/settings/billing"
            isLast
          />
        </div>

        {/* Customize section — navigation rows to sub-pages plus the
            language selector and activity-default visibility toggle
            (both inline since they're single controls, not full sub-pages).
            Widget is native-only since the widget config only does
            anything inside the Android app. Appearance is here (not
            inline above) so users can deep-link to it and the hardware
            back button has a clear "return to settings" target. */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <h2 className="text-sm font-semibold px-5 pt-5 pb-3">{t('settings.personalizeSection')}</h2>

          <SettingsNavRow
            icon={<Palette className="w-5 h-5 text-primary" />}
            title={t('settings.appearanceRow.label')}
            sub={t('settings.appearanceRow.sub')}
            href="/dashboard/settings/appearance"
          />

          {isNative && (
            <SettingsNavRow
              icon={<LayoutPanelTop className="w-5 h-5 text-primary" />}
              title={t('settings.widgetRow.label')}
              sub={t('settings.widgetRow.sub')}
              href="/dashboard/widgets"
            />
          )}

          <SettingsNavRow
            icon={<Bell className="w-5 h-5 text-primary" />}
            title={t('settings.notificationsRow.label')}
            sub={t('settings.notificationsRow.sub')}
            href="/dashboard/settings/notifications"
          />

          <SettingsNavRow
            icon={<Clock className="w-5 h-5 text-primary" />}
            title={t('settings.dateTimeRow.label')}
            sub={t('settings.dateTimeRow.sub')}
            href="/dashboard/settings/datetime"
          />

          {/* Dark mode toggle — moved here from the sidebar (where it lived
              next to Settings + Support). A frequently-flipped preference
              that pairs naturally with the rest of the personalize section. */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
            <span className="shrink-0">
              {theme === 'dark'
                ? <Moon className="w-5 h-5 text-primary" />
                : <Sun  className="w-5 h-5 text-primary" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{t('settings.darkModeLabel')}</span>
              <span className="block text-xs text-muted-foreground">
                {theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight')}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                'shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors',
                theme === 'dark' ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {/* Default activity visibility — inline toggle so users discover
              and flip it without an extra navigation hop. Hidden until the
              profile lands so the switch doesn't flicker on the first paint
              of a fresh signup whose preferences row is still mid-create. */}
          {profile && (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <span className="shrink-0">
                {defaultPublic
                  ? <Eye  className="w-5 h-5 text-primary" />
                  : <Lock className="w-5 h-5 text-primary" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{t('settings.defaultVisibility.label')}</span>
                <span className="block text-xs text-muted-foreground">
                  {defaultPublic
                    ? t('settings.defaultVisibility.subVisible')
                    : t('settings.defaultVisibility.subPrivate')}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={defaultPublic}
                onClick={() => handleDefaultPublicChange(!defaultPublic)}
                className={cn(
                  'shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  defaultPublic ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                    defaultPublic ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          )}

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
// Uses next/link so the destination route is prefetched in the background
// once the Settings page renders, eliminating the bundle-download stall on
// the first tap into Appearance / Notifications / etc.
function SettingsNavRow({
  icon, title, sub, href, isLast,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  href: string
  isLast?: boolean
}) {
  return (
    <Link
      href={href}
      prefetch
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
    </Link>
  )
}
