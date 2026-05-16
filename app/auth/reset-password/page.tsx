'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { translateAuthError } from '@/lib/auth-errors'
import { useI18n } from '@/lib/i18n'

export default function ResetPasswordPage() {
  const { t, locale } = useI18n()
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1))
      const desc = params.get('error_description')
      setError(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : t('auth.reset.invalidLink'))
      setSessionReady(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session)
      if (!session) {
        setError(t('auth.reset.expiredLink'))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirmMatches = confirm.length > 0 && confirm === password
  const confirmMismatch = confirm.length > 0 && confirm !== password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (confirmMismatch) {
      setError(t('auth.reset.errorMismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('auth.reset.errorTooShort'))
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(translateAuthError(error.message, locale))
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  if (sessionReady === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('auth.reset.verifying')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-2xl">DayFlow</span>
        </div>

        <h2 className="text-3xl font-semibold mb-2">{t('auth.reset.title')}</h2>
        <p className="text-muted-foreground mb-8">{t('auth.reset.subtitle')}</p>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-4 text-sm">
            {error}
            {!sessionReady && (
              <div className="mt-2">
                <Link href="/auth/forgot-password" className="underline font-medium">
                  {t('auth.reset.requestNew')}
                </Link>
              </div>
            )}
          </div>
        )}

        {sessionReady && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.reset.newPasswordLabel')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.signup.passwordPlaceholder')}
                  required
                  minLength={8}
                  autoFocus
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

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.reset.confirmPasswordLabel')}</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={t('auth.reset.confirmPlaceholder')}
                  required
                  className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm outline-none focus:ring-2 transition-shadow placeholder:text-muted-foreground bg-background
                    ${confirmMatches  ? 'border-emerald-500 focus:ring-emerald-500/30' :
                      confirmMismatch ? 'border-destructive focus:ring-destructive/30' :
                      'border-input focus:ring-ring'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirm ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {confirmMatches && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                )}
                {confirmMismatch && (
                  <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive pointer-events-none" />
                )}
              </div>
              {confirmMatches && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{t('auth.reset.match')}</p>
              )}
              {confirmMismatch && (
                <p className="text-xs text-destructive mt-1">{t('auth.reset.mismatch')}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || confirmMismatch || confirm.length === 0}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('auth.reset.submitting') : t('auth.reset.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
