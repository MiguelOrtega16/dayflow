import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Wraps the native DailySummary plugin (see DailySummaryPlugin.kt). The
 * plugin maintains an always-pinned tray notification that shows today's
 * activity count and two action buttons (+ Task / + Reminder).
 *
 * Web is a no-op — the summary only makes sense on Android, where it lives
 * in the system tray.
 */
interface DailySummaryPlugin {
  setEnabled(opts: { enabled: boolean }): Promise<void>
  refresh(): Promise<void>
  cancel(): Promise<void>
  isEnabled(): Promise<{ enabled: boolean }>
}

const native = registerPlugin<DailySummaryPlugin>('DailySummary')

export function isDailySummarySupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export const DailySummary = {
  setEnabled: (enabled: boolean) =>
    isDailySummarySupported() ? native.setEnabled({ enabled }) : Promise.resolve(),

  /** Re-build the tray entry from the current widget snapshot. Cheap (no
   *  network) — safe to call after every activity create / edit / delete. */
  refresh: () =>
    isDailySummarySupported() ? native.refresh() : Promise.resolve(),

  cancel: () =>
    isDailySummarySupported() ? native.cancel() : Promise.resolve(),

  isEnabled: (): Promise<boolean> =>
    isDailySummarySupported()
      ? native.isEnabled().then(r => r.enabled)
      : Promise.resolve(false),
}
