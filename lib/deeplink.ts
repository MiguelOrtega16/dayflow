import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Wrapper for the native DeepLink plugin (see DeepLinkPlugin.kt).
 *
 * On Android cold start, the MainActivity stashes any pending in-app
 * path (e.g. /dashboard?create=today&type=task from the daily-summary
 * notification's + Task action) to SharedPreferences instead of trying
 * to run evaluateJavascript on a still-loading WebView. The dashboard
 * shell calls `consumePending()` once on mount; if a path comes back
 * we do a full window.location.href so every downstream useEffect
 * (calendar-view's ?create= reader, etc.) fires with the right query.
 *
 * No-op on web / iOS where the bridge doesn't exist.
 */
interface DeepLinkPlugin {
  consumePending(): Promise<{ path: string | null }>
}

const native = registerPlugin<DeepLinkPlugin>('DeepLink')

function isSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export const DeepLink = {
  consumePending: (): Promise<string | null> =>
    isSupported()
      ? native.consumePending().then(r => r.path)
      : Promise.resolve(null),
}
