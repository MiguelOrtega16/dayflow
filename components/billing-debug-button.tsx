'use client'

// TODO(launch): delete this component after Phase 3 paywall ships.
// Renders nothing on web. On native (Capacitor) shows four buttons that
// invoke RevenueCat directly so we can verify the Android purchase pipeline
// without needing a real paywall UI built yet.

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { purchaseProduct, restorePurchases } from '@/lib/billing/revenuecat'
import type { BillingProductId } from '@/types'

export function BillingDebugButton() {
  const [native, setNative] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setNative(Capacitor.isNativePlatform())
  }, [])

  if (!native) return null

  async function buy(productId: BillingProductId) {
    setBusy(productId)
    setMessage(null)
    try {
      await purchaseProduct(productId)
      setMessage(`Purchase OK: ${productId} — watch the sidebar for the PRO pill`)
    } catch (err) {
      setMessage(`Purchase failed: ${String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function restore() {
    setBusy('restore')
    setMessage(null)
    try {
      await restorePurchases()
      setMessage('Restore OK')
    } catch (err) {
      setMessage(`Restore failed: ${String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Billing debug (remove before launch)
      </div>
      <div className="flex flex-wrap gap-2">
        <DebugBtn busy={busy === 'pro_monthly'} onClick={() => buy('pro_monthly')}>
          Buy Monthly
        </DebugBtn>
        <DebugBtn busy={busy === 'pro_annual'} onClick={() => buy('pro_annual')}>
          Buy Annual (3-day trial)
        </DebugBtn>
        <DebugBtn busy={busy === 'pro_lifetime'} onClick={() => buy('pro_lifetime')}>
          Buy Lifetime
        </DebugBtn>
        <DebugBtn busy={busy === 'restore'} onClick={restore}>
          Restore
        </DebugBtn>
      </div>
      {message && (
        <div className="mt-2 text-xs text-muted-foreground break-words">{message}</div>
      )}
    </div>
  )
}

function DebugBtn({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode
  onClick: () => void
  busy: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-amber-500/40 bg-background px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10 disabled:opacity-50"
    >
      {busy ? '…' : children}
    </button>
  )
}
