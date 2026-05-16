'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

type Step = 'info' | 'confirm' | 'deleting' | 'done'

const DATA_ITEM_KEYS = ['profile','activities','goals','comments','invitations','shared','notifications','push','evidence','account'] as const

export default function DeleteAccountPage() {
  const { t } = useI18n()
  const [user, setUser]   = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep]   = useState<Step>('info')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async () => {
    setStep('deleting')
    setError(null)
    try {
      const res = await fetch('/api/delete-account', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || t('deleteAccount.genericError'))
      }
      await supabase.auth.signOut()
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.unexpectedError'))
      setStep('confirm')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">{t('deleteAccount.done.title')}</h2>
          <p className="text-muted-foreground mb-6">{t('deleteAccount.done.body')}</p>
          <Link href="/auth/login" className="text-primary hover:underline font-medium text-sm">
            {t('deleteAccount.done.back')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-xl">DayFlow</span>
        </div>

        <h1 className="text-3xl font-semibold mb-2">{t('deleteAccount.title')}</h1>
        <p className="text-muted-foreground mb-10">{t('deleteAccount.subtitle')}</p>

        {/* Data deleted */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{t('deleteAccount.dataDeleted')}</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {DATA_ITEM_KEYS.map(key => (
              <li key={key} className="flex items-start gap-2">
                <span className="text-destructive mt-0.5">•</span>
                {t(`deleteAccount.dataItems.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        {/* Retention */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{t('deleteAccount.retentionTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('deleteAccount.retentionBody')}</p>
        </section>

        {/* How to request deletion */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">{t('deleteAccount.howTitle')}</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="font-semibold text-foreground w-5 shrink-0">1.</span>
              <span>{t('deleteAccount.howStep1')}</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-foreground w-5 shrink-0">2.</span>
              <span>
                {t('deleteAccount.howStep2_pre')}
                <strong className="text-foreground">{t('deleteAccount.howStep2_strong')}</strong>
                {t('deleteAccount.howStep2_post')}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-foreground w-5 shrink-0">3.</span>
              <span>{t('deleteAccount.howStep3')}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-5">
            {t('deleteAccount.supportNotePre')}
            <a href="mailto:soporte@day-flow.co" className="text-primary hover:underline">
              soporte@day-flow.co
            </a>
            {t('deleteAccount.supportNotePost')}
          </p>
        </section>

        {/* Self-service deletion */}
        {!user ? (
          <div className="bg-muted rounded-2xl p-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">{t('deleteAccount.loginPrompt')}</p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('deleteAccount.login')}
            </Link>
          </div>
        ) : step === 'info' ? (
          <div className="border border-destructive/20 bg-destructive/5 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-5 h-5 text-destructive" />
              <h3 className="font-semibold text-destructive">{t('deleteAccount.dangerZone')}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t('deleteAccount.loggedInAsPre')}
              <strong>{user.email}</strong>
              {t('deleteAccount.loggedInAsPost')}
            </p>
            <button
              onClick={() => setStep('confirm')}
              className="bg-destructive text-destructive-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              {t('deleteAccount.deleteMyAccount')}
            </button>
          </div>
        ) : step === 'confirm' || step === 'deleting' ? (
          <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">{t('deleteAccount.areYouSure')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('deleteAccount.confirmBodyPre')}
                  <strong>{user.email}</strong>
                  {t('deleteAccount.confirmBodyPost')}
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleDelete}
                disabled={step === 'deleting'}
                className="flex items-center gap-2 bg-destructive text-destructive-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-destructive/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {step === 'deleting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t('deleteAccount.confirmDelete')}
                  </>
                )}
              </button>
              {step !== 'deleting' && (
                <button
                  onClick={() => setStep('info')}
                  className="rounded-xl px-5 py-2.5 text-sm font-medium border border-border hover:bg-muted transition-colors"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
