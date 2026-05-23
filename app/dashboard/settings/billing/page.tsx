'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, Crown, ExternalLink, Sparkles, Check, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useI18n, dateFnsLocale } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { useBackButtonRoute } from '@/lib/back-button'
import { cn } from '@/lib/utils'

// Feature matrix used by the comparison table. Kept here as data so adding a
// new Pro perk is a one-line change. Strings come from i18n; `freeValue` and
// `proValue` accept either a plain string (rendered as text) or `true`/`false`
// (rendered as check/cross). When highlight=true the Pro column gets a soft
// indigo tint — used for the most differentiating rows so they catch the eye.
type CellValue = string | true | false
interface FeatureRow {
  labelKey: string
  freeValue: CellValue
  proValue: CellValue
  highlight?: boolean
}

// Ordered to read as: "the perks you keep" first (Free+Pro both green),
// then the Pro upsells (Free crossed, Pro green). Highlighted rows are
// the strongest differentiators visually. Attachments deliberately omitted
// — the feature isn't shipping with this comparison.
const FEATURE_MATRIX: FeatureRow[] = [
  // Common floor — proves the Free tier isn't a gutted demo.
  { labelKey: 'templates',         freeValue: true,                        proValue: true                       },
  { labelKey: 'realtimeSync',      freeValue: true,                        proValue: true                       },
  { labelKey: 'comments',          freeValue: true,                        proValue: true                       },
  { labelKey: 'statsDashboard',    freeValue: true,                        proValue: true                       },
  { labelKey: 'sharedCalendar',    freeValue: true,                        proValue: true                       },
  // Quantitative differences.
  { labelKey: 'sharedCalendars',   freeValue: 'free.sharedCalendarsValue', proValue: 'pro.unlimited',           highlight: true },
  { labelKey: 'themes',            freeValue: 'free.themesValue',          proValue: 'pro.themesValue',         highlight: true },
  { labelKey: 'avatarColors',      freeValue: 'free.colorsValue',          proValue: 'pro.colorsValue' },
  { labelKey: 'widgets',           freeValue: 'free.widgetsValue',         proValue: 'pro.widgetsValue' },
  // Pure Pro perks.
  { labelKey: 'recurrence',        freeValue: false,                       proValue: true                       },
  { labelKey: 'multiReminders',    freeValue: false,                       proValue: true                       },
  { labelKey: 'statsExport',       freeValue: false,                       proValue: true                       },
  { labelKey: 'ads',               freeValue: 'free.adsValue',             proValue: 'pro.adsValue' },
]

export default function BillingSettingsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const { entitlement, loading: entLoading } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()
  const native = Capacitor.isNativePlatform()

  useBackButtonRoute(() => router.push('/dashboard/settings'))

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Reuses the paywall's manage flow: native → Play subscriptions URL,
  // web → Stripe Customer Portal redirect. We don't duplicate the upgrade
  // buttons here — the paywall is the canonical "switch plan" surface.
  async function handleManage() {
    setBusy(true)
    setPortalError(null)
    try {
      if (native) {
        window.open('https://play.google.com/store/account/subscriptions', '_blank')
      } else {
        const r = await fetch('/api/billing/portal', { method: 'POST' })
        const data = await r.json()
        if (data.url) window.location.href = data.url
        else setPortalError(data.error ?? 'portal failed')
      }
    } catch (err) {
      setPortalError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const fmtDate = (iso: string | null) =>
    iso ? format(new Date(iso), 'PPP', { locale: dateFnsLocale(locale) }) : '—'

  // Per-plan summary line under the plan name in the status hero.
  const periodLine = () => {
    const ent = entitlement
    if (ent.plan === 'pro_lifetime') return t('billing.page.lifetime')
    if (ent.isInTrial && ent.expiresAt)              return t('billing.page.trialEnds', { date: fmtDate(ent.expiresAt) })
    if (ent.cancelAtPeriodEnd && ent.expiresAt)      return t('billing.page.endsOn',    { date: fmtDate(ent.expiresAt) })
    if (ent.expiresAt)                                return t('billing.page.renewsOn',  { date: fmtDate(ent.expiresAt) })
    return ''
  }

  const planLabel =
    entitlement.plan === 'pro_annual'   ? t('billing.paywall.plans.annual')
    : entitlement.plan === 'pro_monthly' ? t('billing.paywall.plans.monthly')
    : entitlement.plan === 'pro_lifetime'? t('billing.paywall.plans.lifetime')
    : '—'

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('billing.page.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('billing.page.title')}</h1>
      </header>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-6">

        {/* ── Status hero ── */}
        {entLoading ? (
          <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            <span className="text-sm text-muted-foreground">{t('billing.page.loading')}</span>
          </div>
        ) : entitlement.isPro ? (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">{t('billing.page.proHeading')}</h2>
                  {entitlement.isInTrial && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      {t('billing.trialPill')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {planLabel} {periodLine() && <span>· {periodLine()}</span>}
                </p>
                {entitlement.cancelAtPeriodEnd && !entitlement.isInTrial && (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                    {t('billing.page.cancelingNotice')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {entitlement.plan !== 'pro_lifetime' && (
                <button
                  onClick={handleManage}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {busy ? '…' : (
                    <>
                      {native ? t('billing.page.manageAndroid') : t('billing.page.manageWeb')}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
              {/* Even Pro users see the paywall — that's where the "switch plan"
                  buttons live (Switch to Annual / Get Lifetime on native).
                  Hidden for Lifetime since there's nothing to switch to. */}
              {entitlement.plan !== 'pro_lifetime' && (
                <button
                  onClick={() => openPaywall('generic')}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  {t('billing.page.switchPlan')}
                </button>
              )}
              {portalError && <p className="text-xs text-destructive">{portalError}</p>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold">{t('billing.page.freeHeading')}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('billing.page.freeSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => openPaywall('generic')}
              className="mt-4 w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
            >
              {t('billing.page.upgradeCta')}
            </button>
          </div>
        )}

        {/* ── Comparison table ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">{t('billing.page.compareHeading')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('billing.page.compareSubtitle')}</p>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_70px_70px] sm:grid-cols-[1fr_100px_100px] gap-2 px-5 py-2 border-b border-border bg-muted/30">
            <div /> {/* spacer for the feature label column */}
            <div className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('billing.page.colFree')}
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 inline-flex items-center justify-center gap-1">
              <Crown className="w-3 h-3" />
              {t('billing.page.colPro')}
            </div>
          </div>

          {/* Rows */}
          <ul className="divide-y divide-border">
            {FEATURE_MATRIX.map(row => (
              <li
                key={row.labelKey}
                className={cn(
                  'grid grid-cols-[1fr_70px_70px] sm:grid-cols-[1fr_100px_100px] gap-2 px-5 py-3 items-center',
                  row.highlight && 'bg-indigo-500/[0.04]',
                )}
              >
                <span className="text-sm font-medium min-w-0">
                  {t(`billing.page.features.${row.labelKey}.label`)}
                </span>
                <div className="text-center text-xs text-muted-foreground">
                  <ValueCell value={row.freeValue} t={t} />
                </div>
                <div className="text-center text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  <ValueCell value={row.proValue} t={t} pro />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Free users get a second upgrade CTA at the bottom of the long table
            so they don't have to scroll back up to act on what they just read. */}
        {!entLoading && !entitlement.isPro && (
          <button
            onClick={() => openPaywall('generic')}
            className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            {t('billing.page.upgradeCta')}
          </button>
        )}

      </div>
    </div>
  )
}

// Renders either a check / cross icon or a localized value string,
// depending on the cell type. Plain-string cells go through i18n so
// "Unlimited" / "Ilimitado" etc. follow the user's locale.
function ValueCell({ value, t, pro }: {
  value: CellValue
  t: (key: string) => string
  pro?: boolean
}) {
  if (value === true)  return <Check className={cn('w-4 h-4 inline', pro ? 'text-emerald-500' : 'text-muted-foreground')} />
  if (value === false) return <X className="w-4 h-4 inline text-muted-foreground/50" />
  return <span>{t(`billing.page.values.${value}`)}</span>
}
