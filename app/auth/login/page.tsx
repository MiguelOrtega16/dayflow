'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { translateAuthError } from '@/lib/auth-errors'
import { useI18n } from '@/lib/i18n'
import { identify, track } from '@/lib/analytics/posthog'

const REMEMBERED_EMAIL_KEY = 'dayflow_remembered_email'

export default function LoginPage() {
  const { t, locale } = useI18n()
  // Prefill the last-used email when the user opted to be remembered.
  const [email, setEmail]     = useState(() =>
    typeof window === 'undefined' ? '' : (localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''))
  const [password, setPassword] = useState('')
  // Default on; only off if the user previously logged in with it unchecked
  // (which clears the stored email).
  const [rememberMe, setRememberMe]     = useState(() =>
    typeof window === 'undefined' ? true
      : localStorage.getItem('dayflow_remember_me') !== '0')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Surface errors forwarded from the auth callback (e.g. expired confirmation link)
  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search) : null
  const [error, setError] = useState<string | null>(() => {
    const raw = searchParams?.get('error')
    return raw ? translateAuthError(decodeURIComponent(raw), locale) : null
  })
  const router   = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(translateAuthError(error.message, locale))
      setLoading(false)
    } else {
      // Remember the email for next time (or forget it if opted out). The
      // session itself stays persistent regardless (Supabase keeps a long-lived
      // refresh-token cookie); this only controls email prefill.
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
        localStorage.setItem('dayflow_remember_me', '1')
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY)
        localStorage.setItem('dayflow_remember_me', '0')
      }
      if (data.user?.id) identify(data.user.id, { email })
      track('user_logged_in', { method: 'email' })
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-500 via-indigo-600 to-pink-500 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-10 w-96 h-96 bg-pink-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <img src="/icon-512.png" alt="DayFlow" className="w-12 h-12 rounded-2xl shadow-lg ring-1 ring-white/30 object-cover" />
            <span className="text-white font-semibold text-2xl">DayFlow</span>
          </div>
          <h1 className="font-semibold text-5xl text-white leading-tight mb-6">
            {t('auth.hero.line1')}<br /><em>{t('auth.hero.line2')}</em><br />{t('auth.hero.line3')}
          </h1>
          <p className="text-white/70 text-lg leading-relaxed max-w-md">
            {t('auth.brandSubtitle')}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 relative">
          {[
            t('auth.features.calendar'),
            t('auth.features.goals'),
            t('auth.features.shared'),
            t('auth.features.recurring'),
            t('auth.features.progress'),
            t('auth.features.realtime'),
          ].map(f => (
            <div key={f} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-white/90 text-sm">{f}</div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <img src="/icon-512.png" alt="DayFlow" className="w-10 h-10 rounded-xl shadow-sm object-cover" />
            <span className="font-semibold text-2xl">DayFlow</span>
          </div>

          <h2 className="text-2xl font-semibold mb-1">{t('auth.login.title')}</h2>
          <p className="text-muted-foreground mb-8">{t('auth.login.subtitle')}</p>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.login.emailLabel')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.login.emailPlaceholder')}
                required
                autoFocus
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium">{t('auth.login.passwordLabel')}</label>
                <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">
                  {t('auth.login.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  required
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-11 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
              />
              {t('auth.login.rememberMe')}
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('auth.login.submitting') : t('auth.login.submit')}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t('auth.login.noAccount')}{' '}
            <Link href="/auth/signup" className="text-primary hover:underline font-medium">
              {t('auth.login.signupCta')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
