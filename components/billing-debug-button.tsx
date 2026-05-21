'use client'

// TODO(launch): delete this component (and /api/debug/billing/set-state)
// once the paywall + entitlement flow has shipped and been exercised in
// production. Useful only for manual QA of subscription states.

import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { usePaywall } from '@/components/paywall/paywall-provider'
import type { PaywallTrigger } from '@/components/paywall/paywall'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { Subscription } from '@/types'
import { ChevronDown, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const TRIGGERS: Array<{ label: string; trigger: PaywallTrigger }> = [
  { label: 'Generic',       trigger: 'generic' },
  { label: 'Sharing limit', trigger: 'sharing_limit' },
  { label: 'Goals limit',   trigger: 'goals_limit' },
  { label: 'Locked widget', trigger: 'locked_widget' },
]

// Mirrors STATES in app/api/debug/billing/set-state/route.ts. Kept here as
// a hand-typed list so the UI ordering matches the testing matrix in the
// payment-scenarios plan (free first, then happy-paths, then edge cases).
const DEBUG_STATES: Array<{ id: string; label: string; tone: 'free' | 'pro' | 'edge' }> = [
  { id: 'free',                 label: 'Free',            tone: 'free' },
  { id: 'pro_monthly_active',   label: 'Pro Monthly',     tone: 'pro' },
  { id: 'pro_annual_trialing',  label: 'Annual (Trial)',  tone: 'pro' },
  { id: 'pro_annual_active',    label: 'Annual',          tone: 'pro' },
  { id: 'pro_lifetime',         label: 'Lifetime',        tone: 'pro' },
  { id: 'rc_monthly_active',    label: 'RC Monthly',      tone: 'pro' },
  { id: 'canceling',            label: 'Canceling',       tone: 'edge' },
  { id: 'past_due',             label: 'Past due',        tone: 'edge' },
  { id: 'expired',              label: 'Expired',         tone: 'edge' },
]

export function BillingDebugButton() {
  const { open } = usePaywall()
  const [platform, setPlatform] = useState<string>('?')
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<Subscription[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const { entitlement, loading: entLoading } = useEntitlement(userId)

  useEffect(() => {
    setPlatform(Capacitor.isNativePlatform() ? 'native' : 'web')
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  // Pull the raw subscription rows alongside the computed entitlement so
  // testers can see the difference between "row exists" and "row counted as
  // active". Re-fetches whenever the realtime channel inside useEntitlement
  // is likely to have fired — keyed on the entitlement object identity.
  const loadRows = async () => {
    if (!userId) return
    setRowsLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      setRows((data ?? []) as Subscription[])
    } finally {
      setRowsLoading(false)
    }
  }

  useEffect(() => { loadRows() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId, entitlement])

  const setState = async (state: string) => {
    setBusy(state)
    setLastError(null)
    try {
      const res = await fetch('/api/debug/billing/set-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLastError(body.error ?? `HTTP ${res.status}`)
      }
      // No explicit refetch — the realtime channel inside useEntitlement
      // will pick up the change and the loadRows effect above will fire
      // when the entitlement object updates.
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const fmtTime = (v: string | null) => v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '—'

  return (
    <div className="mb-4 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Billing debug · {platform} · remove before launch
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-amber-600 dark:text-amber-400 transition-transform', collapsed && '-rotate-90')} />
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Live entitlement summary — what the rest of the app sees right now. */}
          <div className="rounded-md border border-amber-500/30 bg-background p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Computed entitlement
            </div>
            {entLoading ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono">
                <span className="text-muted-foreground">isPro</span>
                <span className={cn('font-semibold', entitlement.isPro ? 'text-emerald-600' : 'text-muted-foreground')}>
                  {String(entitlement.isPro)}
                </span>
                <span className="text-muted-foreground">isInTrial</span>
                <span className={cn('font-semibold', entitlement.isInTrial ? 'text-amber-600' : 'text-muted-foreground')}>
                  {String(entitlement.isInTrial)}
                </span>
                <span className="text-muted-foreground">plan</span>
                <span>{entitlement.plan ?? '—'}</span>
                <span className="text-muted-foreground">platform</span>
                <span>{entitlement.platform ?? '—'}</span>
                <span className="text-muted-foreground">expiresAt</span>
                <span>{fmtTime(entitlement.expiresAt)}</span>
                <span className="text-muted-foreground">cancelAtPeriodEnd</span>
                <span className={cn(entitlement.cancelAtPeriodEnd && 'text-red-600 font-semibold')}>
                  {String(entitlement.cancelAtPeriodEnd)}
                </span>
              </div>
            )}
          </div>

          {/* Raw subscription rows — what's actually in the DB. */}
          <div className="rounded-md border border-amber-500/30 bg-background p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Subscription rows ({rows.length})
              </span>
              <button
                type="button"
                onClick={loadRows}
                disabled={rowsLoading}
                className="text-muted-foreground hover:text-foreground p-0.5"
                aria-label="Refresh"
              >
                <RefreshCcw className={cn('w-3 h-3', rowsLoading && 'animate-spin')} />
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">None — user is Free.</div>
            ) : (
              <div className="space-y-1.5">
                {rows.map(r => (
                  <div key={r.id} className="rounded border border-border bg-card p-2 font-mono text-[10px] leading-relaxed">
                    <div><span className="text-muted-foreground">provider:</span> {r.provider} · {r.platform}</div>
                    <div><span className="text-muted-foreground">product:</span> {r.product_id}</div>
                    <div>
                      <span className="text-muted-foreground">status:</span>{' '}
                      <span className={cn(
                        'font-semibold',
                        r.status === 'active'    && 'text-emerald-600',
                        r.status === 'trialing'  && 'text-amber-600',
                        r.status === 'past_due'  && 'text-orange-600',
                        (r.status === 'canceled' || r.status === 'expired') && 'text-red-600',
                      )}>{r.status}</span>
                      {r.cancel_at_period_end && <span className="text-red-600"> · cancel_at_period_end</span>}
                    </div>
                    <div><span className="text-muted-foreground">period_end:</span> {fmtTime(r.current_period_end)}</div>
                    {r.trial_end && <div><span className="text-muted-foreground">trial_end:</span> {fmtTime(r.trial_end)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Force a state — wipes existing rows then inserts the target shape. */}
          <div className="rounded-md border border-amber-500/30 bg-background p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Force state (current user only)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEBUG_STATES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setState(s.id)}
                  disabled={busy !== null}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    s.tone === 'free' && 'border-border bg-card hover:bg-muted',
                    s.tone === 'pro'  && 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                    s.tone === 'edge' && 'border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/15 text-orange-700 dark:text-orange-400',
                    busy === s.id && 'opacity-60',
                  )}
                >
                  {busy === s.id ? '…' : s.label}
                </button>
              ))}
            </div>
            {lastError && (
              <div className="mt-2 text-[10px] text-red-600 font-mono">{lastError}</div>
            )}
          </div>

          {/* Paywall trigger previews — unchanged from the original component. */}
          <div className="rounded-md border border-amber-500/30 bg-background p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Open paywall
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TRIGGERS.map(({ label, trigger }) => (
                <button
                  key={trigger}
                  onClick={() => open(trigger)}
                  className="rounded-md border border-amber-500/40 bg-card px-2.5 py-1 text-xs font-medium hover:bg-amber-500/10"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
