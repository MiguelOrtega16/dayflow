'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { translateAuthError } from '@/lib/auth-errors'
import { useI18n } from '@/lib/i18n'
import { identify, track } from '@/lib/analytics/posthog'

export default function SignupPage() {
  const { t, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) {
      setError(translateAuthError(error.message, locale))
      setLoading(false)
    } else if (data.session) {
      if (data.user?.id) identify(data.user.id, { email, full_name: fullName })
      track('user_signed_up', { method: 'email', confirmation_required: false })
      router.push('/dashboard')
      router.refresh()
    } else {
      if (data.user?.id) identify(data.user.id, { email, full_name: fullName })
      track('user_signed_up', { method: 'email', confirmation_required: true })
      setNeedsConfirmation(true)
      setLoading(false)
    }
  }

  if (needsConfirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📧</span>
          </div>
          <h2 className="text-2xl font-semibold mb-2">{t('auth.signup.confirm.title')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('auth.signup.confirm.bodyPre')}
            <strong>{email}</strong>
            {t('auth.signup.confirm.bodyPost')}
          </p>
          <Link href="/auth/login" className="text-primary hover:underline">
            {t('auth.signup.confirm.back')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/icon-512.png" alt="DayFlow" className="w-10 h-10 rounded-xl shadow-sm object-cover" />
          <span className="font-semibold text-2xl">DayFlow</span>
        </div>

        <h2 className="text-3xl font-semibold mb-2">{t('auth.signup.title')}</h2>
        <p className="text-muted-foreground mb-8">{t('auth.signup.subtitle')}</p>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('auth.signup.fullNameLabel')}</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={t('auth.signup.fullNamePlaceholder')}
              required
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('auth.login.emailLabel')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('auth.login.emailPlaceholder')}
              required
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('auth.login.passwordLabel')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('auth.signup.passwordPlaceholder')}
                required
                minLength={8}
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
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('auth.signup.haveAccount')}{' '}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            {t('auth.signup.loginCta')}
          </Link>
        </p>
      </div>
    </div>
  )
}
