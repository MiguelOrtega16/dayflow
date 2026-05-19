'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, AlertCircle, HelpCircle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useI18n } from '@/lib/i18n'
import { SystemSettings } from '@/lib/system-settings'
import { cn } from '@/lib/utils'

type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'

export default function NotifTroubleshootPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [isNative, setIsNative] = useState(false)
  const [permission, setPermission] = useState<PermState>('unknown')
  const [batteryIgnoring, setBatteryIgnoring] = useState<boolean | null>(null)

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])

  // Read all states on mount + whenever the page regains focus (so returning
  // from system settings refreshes the chips).
  useEffect(() => {
    refreshAll()
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative])

  const refreshAll = async () => {
    if (isNative) {
      try {
        const res = await LocalNotifications.checkPermissions()
        const d = res.display
        setPermission(d === 'granted' ? 'granted' : d === 'denied' ? 'denied' : 'prompt')
      } catch {
        setPermission('unknown')
      }
      try {
        const { ignoring } = await SystemSettings.checkBatteryOptimization()
        setBatteryIgnoring(ignoring)
      } catch {
        setBatteryIgnoring(null)
      }
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      const p = Notification.permission
      setPermission(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt')
    } else {
      setPermission('unsupported')
    }
  }

  // ── Notifications row ──────────────────────────────────────────────────────
  const handleNotificationsAction = async () => {
    if (isNative) {
      // If we've never asked (or only soft-denied), use the permission prompt.
      // If hard-denied, jump to the app's notification settings instead.
      if (permission === 'denied') {
        try { await SystemSettings.openAppNotificationSettings() } catch {}
        return
      }
      try {
        const res = await LocalNotifications.requestPermissions()
        setPermission(res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt')
      } catch {}
    } else if ('Notification' in window) {
      const p = await Notification.requestPermission()
      setPermission(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt')
    }
  }

  // ── Battery / Auto-restart rows ────────────────────────────────────────────
  const handleBatteryAction = async () => {
    try { await SystemSettings.openBatteryOptimizationSettings() } catch {}
  }
  const handleAutoRestartAction = async () => {
    try { await SystemSettings.openAutoStartSettings() } catch {}
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('notifSettings.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('notifSettings.troubleshoot.pageTitle')}</h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <p className="text-sm text-muted-foreground">
          {isNative ? t('notifSettings.troubleshoot.introMobile') : t('notifSettings.troubleshoot.introWeb')}
        </p>

        {isNative ? (
          // Mobile checklist — each row opens the relevant Android settings
          // screen via the SystemSettings native plugin. Floating-window row
          // was dropped: it's primarily relevant for foreground services /
          // overlay permissions, neither of which the app uses.
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            <ChecklistRow
              title={t('notifSettings.troubleshoot.battery')}
              desc={t('notifSettings.troubleshoot.batteryDesc')}
              status={batteryIgnoring === null ? null : batteryIgnoring ? 'granted' : 'prompt'}
              actionLabel={t('notifSettings.troubleshoot.openSettings')}
              onAction={handleBatteryAction}
              statusLabel={
                batteryIgnoring === true  ? t('notifSettings.troubleshoot.enabled') :
                batteryIgnoring === false ? t('notifSettings.troubleshoot.disabled') :
                null
              }
            />
            <ChecklistRow
              title={t('notifSettings.troubleshoot.autoRestart')}
              desc={t('notifSettings.troubleshoot.autoRestartDesc')}
              status={null}
              actionLabel={t('notifSettings.troubleshoot.openSettings')}
              onAction={handleAutoRestartAction}
            />
            <ChecklistRow
              title={t('notifSettings.troubleshoot.allowNotif')}
              desc={t('notifSettings.troubleshoot.allowNotifDesc')}
              status={permission}
              actionLabel={
                permission === 'denied'
                  ? t('notifSettings.troubleshoot.openSettings')
                  : t('notifSettings.troubleshoot.enable')
              }
              onAction={handleNotificationsAction}
              statusLabel={
                permission === 'granted' ? t('notifSettings.troubleshoot.granted') :
                permission === 'denied'  ? t('notifSettings.troubleshoot.denied')  :
                permission === 'prompt'  ? t('notifSettings.troubleshoot.prompt')  :
                null
              }
            />
          </div>
        ) : (
          // Desktop: single row for browser notification permission.
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            <ChecklistRow
              title={t('notifSettings.troubleshoot.allowNotif')}
              desc={permission === 'unsupported' ? t('notifSettings.troubleshoot.webNotSupported') : t('notifSettings.troubleshoot.allowNotifDesc')}
              status={permission}
              actionLabel={t('notifSettings.troubleshoot.requestWeb')}
              onAction={handleNotificationsAction}
              statusLabel={
                permission === 'granted' ? t('notifSettings.troubleshoot.granted') :
                permission === 'denied'  ? t('notifSettings.troubleshoot.denied')  :
                permission === 'prompt'  ? t('notifSettings.troubleshoot.prompt')  :
                null
              }
              disabled={permission === 'unsupported' || permission === 'granted'}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ChecklistRow({
  title, desc, status, actionLabel, onAction, disabled, statusLabel,
}: {
  title: string
  desc: string
  status: PermState | null
  actionLabel: string
  onAction: () => void
  disabled?: boolean
  statusLabel?: string | null
}) {
  const indicator = (() => {
    if (status === 'granted')   return <Check className="w-4 h-4 text-emerald-500" />
    if (status === 'denied')    return <AlertCircle className="w-4 h-4 text-red-500" />
    if (status === 'prompt')    return <HelpCircle className="w-4 h-4 text-amber-500" />
    return null
  })()

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        {statusLabel && (
          <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
            {indicator}
            <span>{statusLabel}</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled || status === 'granted'}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
          status === 'granted'
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 cursor-default'
            : 'text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {status === 'granted' ? <Check className="w-4 h-4" /> : actionLabel}
      </button>
    </div>
  )
}
