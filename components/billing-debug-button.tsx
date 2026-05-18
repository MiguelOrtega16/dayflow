'use client'

// TODO(launch): delete this component once real feature gates ship and trigger
// the paywall organically. Until then this is the only way to preview the
// paywall UI from a known account. Not linked in production navigation.

import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { usePaywall } from '@/components/paywall/paywall-provider'
import type { PaywallTrigger } from '@/components/paywall/paywall'

const TRIGGERS: Array<{ label: string; trigger: PaywallTrigger }> = [
  { label: 'Generic', trigger: 'generic' },
  { label: 'Sharing limit', trigger: 'sharing_limit' },
  { label: 'Goals limit', trigger: 'goals_limit' },
  { label: 'Locked widget', trigger: 'locked_widget' },
]

export function BillingDebugButton() {
  const { open } = usePaywall()
  const [platform, setPlatform] = useState<string>('?')

  useEffect(() => {
    setPlatform(Capacitor.isNativePlatform() ? 'native' : 'web')
  }, [])

  return (
    <div className="mb-4 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Paywall debug · {platform} · remove before launch
      </div>
      <div className="flex flex-wrap gap-2">
        {TRIGGERS.map(({ label, trigger }) => (
          <button
            key={trigger}
            onClick={() => open(trigger)}
            className="rounded-md border border-amber-500/40 bg-background px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
