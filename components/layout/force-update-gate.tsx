'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  MIN_SUPPORTED_VERSION_CODE,
  getInstalledVersionCode,
  openStoreForUpdate,
} from '@/lib/version-check'
import { useI18n } from '@/lib/i18n'

/**
 * Full-screen blocking modal shown when the installed Android versionCode is
 * below NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE. Independent of Play
 * Core's `updateAvailability` flag — that flag only flips when Google has
 * actually rolled out the new APK to the user's device, which excludes users
 * not opted into the testing track. This gate fires purely on the comparison
 * between the installed build and the env-baked minimum.
 *
 * The modal has no close affordance: tapping the backdrop, hardware back, and
 * Escape all do nothing. The single button opens the Play Store (or kicks off
 * Play Core's immediate update when available).
 */
export function ForceUpdateGate() {
  const { t } = useI18n()
  const [blocked, setBlocked] = useState(false)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    if (MIN_SUPPORTED_VERSION_CODE <= 0) return
    let cancelled = false
    getInstalledVersionCode().then(code => {
      if (cancelled) return
      // code === 0 means we couldn't read it (non-Android, plugin failure).
      // Skip the gate in that case — we'd rather under-prompt than block web
      // users with no path forward.
      if (code > 0 && code < MIN_SUPPORTED_VERSION_CODE) setBlocked(true)
    })
    return () => { cancelled = true }
  }, [])

  if (!blocked) return null

  const handleUpdate = async () => {
    setOpening(true)
    try {
      await openStoreForUpdate()
    } finally {
      // Keep the modal up; we *want* the user gone to the Play Store. If they
      // come back without updating, the gate is still showing.
      setOpening(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="force-update-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h2 id="force-update-title" className="text-lg font-semibold mb-2">
          {t('app.forceUpdateTitle')}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          {t('app.forceUpdateBody')}
        </p>
        <button
          type="button"
          onClick={handleUpdate}
          disabled={opening}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-70"
        >
          {opening && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('app.forceUpdateButton')}
        </button>
      </div>
    </div>
  )
}
