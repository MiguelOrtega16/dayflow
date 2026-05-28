'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import {
  STARTER_PACKS,
  countActivitiesInPack,
  type StarterPack,
  type StarterPackId,
} from '@/lib/onboarding/starter-packs'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics/posthog'
import { pushAdSuppress } from '@/lib/ad-suppress'

interface Props {
  userId: string
}

export function StarterPackPicker({ userId }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [busyPack, setBusyPack] = useState<StarterPackId | null>(null)
  const [donePack, setDonePack] = useState<StarterPackId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => pushAdSuppress('starter-pack-picker'), [])

  useEffect(() => {
    track('starter_picker_shown')
  }, [])

  // Direct preferences write — only used for the Skip path. Pack inserts go
  // through /api/onboarding/insert-starter-pack which uses the service role
  // (needed to bypass the activities-RLS Pro recurrence gate).
  async function markDismissedClient() {
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single()
    const current = (existing?.preferences as Record<string, unknown> | null) ?? {}
    await supabase
      .from('profiles')
      .update({
        preferences: {
          ...current,
          dismissed_starter_picker: true,
          dismissed_starter_picker_at: new Date().toISOString(),
        },
      })
      .eq('id', userId)
  }

  async function insertPack(pack: StarterPack) {
    if (busyPack) return
    setError(null)
    setBusyPack(pack.id)
    track('starter_pack_selected', { pack_id: pack.id })

    try {
      const res = await fetch('/api/onboarding/insert-starter-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: pack.id, locale }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { activity_count: number }

      track('starter_pack_inserted', { pack_id: pack.id, activity_count: data.activity_count })
      setDonePack(pack.id)
      setTimeout(() => router.refresh(), 600)
    } catch (err) {
      console.error('[starter-pack-picker] insert failed', err)
      setError(t('onboarding.starterPicker.error'))
      setBusyPack(null)
    }
  }

  async function handleSkip() {
    if (dismissing || busyPack) return
    setDismissing(true)
    track('starter_picker_skipped')
    try {
      await markDismissedClient()
      router.refresh()
    } catch (err) {
      console.error('[starter-pack-picker] dismiss failed', err)
      // Even if the write fails, hide the picker so the user isn't stuck —
      // worst case it re-appears next load.
      setDismissing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold mb-2">
              {t('onboarding.starterPicker.title')}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t('onboarding.starterPicker.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {STARTER_PACKS.map(pack => {
              const count = countActivitiesInPack(pack)
              const isBusy = busyPack === pack.id
              const isDone = donePack === pack.id
              const ctaLabel = isDone
                ? t('onboarding.starterPicker.added')
                : isBusy
                  ? t('onboarding.starterPicker.inserting')
                  : t('onboarding.starterPicker.cta').replace('{count}', String(count))

              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => insertPack(pack)}
                  disabled={!!busyPack || !!donePack}
                  className={cn(
                    'group text-left bg-card border-2 rounded-2xl p-5 transition-all',
                    'hover:border-primary hover:shadow-md',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isDone ? 'border-emerald-500' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl leading-none shrink-0" aria-hidden>{pack.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base mb-0.5">
                        {t(`onboarding.starterPicker.packs.${pack.id}.name`)}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {t(`onboarding.starterPicker.packs.${pack.id}.description`)}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5',
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-muted text-foreground/80 group-hover:bg-primary group-hover:text-primary-foreground transition-colors',
                    )}
                  >
                    {isDone && <Check className="w-3.5 h-3.5" />}
                    {ctaLabel}
                  </div>
                </button>
              )
            })}
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3 text-center">
              {error}
            </p>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={handleSkip}
              disabled={dismissing || !!busyPack}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 underline-offset-4 hover:underline"
            >
              {t('onboarding.starterPicker.skip')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
