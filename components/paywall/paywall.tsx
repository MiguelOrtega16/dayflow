'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Check, X } from 'lucide-react'
import { useBackButtonClose } from '@/lib/back-button'
import { useI18n } from '@/lib/i18n'
import { ANCHOR_PRICE_USD } from '@/lib/billing/products'
import {
  getOfferingPrices,
  isPurchaseCancelled,
  purchaseProduct,
  restorePurchases,
  type OfferingPriceMap,
} from '@/lib/billing/revenuecat'
import { cn } from '@/lib/utils'
import type { BillingProductId } from '@/types'

export type PaywallTrigger =
  | 'sharing_limit'
  | 'goals_limit'
  | 'advanced_recurrence'
  | 'multi_reminder'
  | 'locked_widget'
  | 'locked_theme'
  | 'locked_color'
  | 'custom_reminders'
  | 'evidence_limit'
  | 'attachments'
  | 'stats_export'
  | 'generic'

const FEATURE_KEYS = ['sharing', 'power', 'widgetsThemes', 'attachExport', 'noAds'] as const

interface PaywallProps {
  userId: string | null
  trigger: PaywallTrigger
  onClose: () => void
}

export function Paywall({ userId, trigger, onClose }: PaywallProps) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<BillingProductId>('pro_annual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [prices, setPrices] = useState<OfferingPriceMap | null>(null)
  const native = Capacitor.isNativePlatform()
  useBackButtonClose(true, onClose)

  // Pull store-localized prices (and per-plan availability) once on mount.
  // On native the strings come back in the user's local currency from Play
  // Store; on web we keep the USD anchor fallback below.
  useEffect(() => {
    if (!native) return
    let cancelled = false
    getOfferingPrices()
      .then((map) => {
        if (cancelled) return
        if (map) setPrices(map)
      })
      .catch((err) => {
        console.warn('[paywall] failed to load offering prices', err)
      })
    return () => {
      cancelled = true
    }
  }, [native])

  // If lifetime isn't published in the RC offering on this device, slide the
  // selection over to annual so the user can still complete a purchase rather
  // than seeing a "package not found" error on tap.
  useEffect(() => {
    if (prices && selected === 'pro_lifetime' && !prices.pro_lifetime.available) {
      setSelected('pro_annual')
    }
  }, [prices, selected])

  function priceFor(id: BillingProductId): string {
    const fromStore = prices?.[id]?.priceString
    if (fromStore) return fromStore
    // Web (or before native prices arrive) — anchor is USD, so label it.
    return `${ANCHOR_PRICE_USD[id]} USD`
  }

  async function handleBuy() {
    if (!userId) {
      setError(t('billing.paywall.errors.signIn'))
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (native) {
        await purchaseProduct(selected)
        onClose()
      } else {
        const r = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selected }),
        })
        const data = await r.json()
        if (data.url) {
          window.location.href = data.url
        } else {
          setError(data.error ?? t('billing.paywall.errors.checkoutFailed'))
        }
      }
    } catch (err) {
      if (isPurchaseCancelled(err)) {
        setInfo(t('billing.paywall.cancelled'))
      } else {
        setError(String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await restorePurchases()
    } catch (err) {
      if (isPurchaseCancelled(err)) {
        setInfo(t('billing.paywall.cancelled'))
      } else {
        setError(String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const ctaLabel =
    selected === 'pro_annual'
      ? t('billing.paywall.cta.startTrial')
      : selected === 'pro_lifetime'
        ? t('billing.paywall.cta.buyLifetime')
        : t('billing.paywall.cta.subscribe')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded"
          aria-label={t('billing.paywall.closeAria')}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pb-3">
          <h2 className="text-2xl font-bold leading-tight">
            {t(`billing.paywall.triggers.${trigger}.title`)}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(`billing.paywall.triggers.${trigger}.subtitle`)}
          </p>
        </div>

        <div className="px-6 pb-4 space-y-1.5">
          {FEATURE_KEYS.map((key) => (
            <div key={key} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
              <span>{t(`billing.paywall.features.${key}`)}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-4 space-y-2">
          <PlanCard
            id="pro_annual"
            selected={selected === 'pro_annual'}
            onSelect={setSelected}
            title={t('billing.paywall.plans.annual')}
            price={priceFor('pro_annual')}
            cadence={t('billing.paywall.plans.perYear')}
            badge={t('billing.paywall.plans.bestValue')}
            sub={t('billing.paywall.plans.trialBadge')}
          />
          <PlanCard
            id="pro_monthly"
            selected={selected === 'pro_monthly'}
            onSelect={setSelected}
            title={t('billing.paywall.plans.monthly')}
            price={priceFor('pro_monthly')}
            cadence={t('billing.paywall.plans.perMonth')}
          />
          {/* Hide Lifetime on native when RC offering doesn't include it —
              otherwise the user taps Subscribe and gets a confusing
              "package not found" error. Web always shows it since Stripe
              checkout handles the lifetime price independently of RC. */}
          {(!native || !prices || prices.pro_lifetime.available) && (
            <PlanCard
              id="pro_lifetime"
              selected={selected === 'pro_lifetime'}
              onSelect={setSelected}
              title={t('billing.paywall.plans.lifetime')}
              price={priceFor('pro_lifetime')}
              cadence={t('billing.paywall.plans.oneTime')}
              sub={t('billing.paywall.plans.lifetimeSub')}
            />
          )}
        </div>

        {info && (
          <div className="px-6 pb-2 text-sm text-muted-foreground">{info}</div>
        )}
        {error && (
          <div className="px-6 pb-2 text-sm text-destructive">{error}</div>
        )}

        <div className="px-6 pb-6 space-y-2">
          <button
            onClick={handleBuy}
            disabled={busy}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl py-3 transition-colors"
          >
            {busy ? '…' : ctaLabel}
          </button>
          {native && (
            <button
              onClick={handleRestore}
              disabled={busy}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
            >
              {t('billing.paywall.restore')}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            {t('billing.paywall.fineprint')}
          </p>
        </div>
      </div>
    </div>
  )
}

function PlanCard({
  id,
  selected,
  onSelect,
  title,
  price,
  cadence,
  badge,
  sub,
}: {
  id: BillingProductId
  selected: boolean
  onSelect: (id: BillingProductId) => void
  title: string
  price: string
  cadence: string
  badge?: string
  sub?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'w-full text-left rounded-xl border p-3 transition',
        selected
          ? 'border-indigo-500 bg-indigo-500/5'
          : 'border-border hover:border-foreground/30',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className="text-right">
          <div className="font-semibold text-sm tabular-nums">{price}</div>
          <div className="text-[11px] text-muted-foreground">{cadence}</div>
        </div>
      </div>
      {badge && (
        <div className="mt-2 inline-block text-[9px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
          {badge}
        </div>
      )}
    </button>
  )
}
