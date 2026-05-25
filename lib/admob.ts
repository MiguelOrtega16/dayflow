// AdMob wrapper — only runs on native (Android) Capacitor builds. Web and
// iOS are no-ops; iOS is gated by `Capacitor.getPlatform() === 'android'`
// rather than a generic isNativePlatform() check so that a future iOS build
// doesn't accidentally start serving ads without ATT being wired up.
//
// Initialization flow per dashboard mount:
//   1. AdMob.initialize() — idempotent inside the plugin
//   2. UMP consent (Google's GDPR / Google-required consent flow). On
//      non-EU devices the form is never shown; we still call to record the
//      "no consent required" status.
//   3. Once consent resolves, callers can show/hide banners via showBanner /
//      hideBanner. Banner ad-unit id is env-baked.
//
// Failures are caught and logged but never thrown — ads must NEVER block
// the app from loading. A user with no ads is still a working user.

import { Capacitor } from '@capacitor/core'

// Google's "always-fill" test banner id. Used in non-production to avoid
// accidentally serving real ads (and getting our AdMob account flagged for
// invalid traffic during dev). See https://developers.google.com/admob/android/test-ads.
const TEST_BANNER_AD_ID = 'ca-app-pub-3940256099942544/6300978111'

const isAndroidNative = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

let initPromise: Promise<void> | null = null

/**
 * Initialize AdMob + run the UMP consent flow once per app launch. Safe to
 * call from multiple places — the promise is cached.
 */
export function initAdMob(): Promise<void> {
  if (!isAndroidNative()) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob')
      await AdMob.initialize({
        initializeForTesting: process.env.NEXT_PUBLIC_ENV !== 'production',
        // testingDevices accepts a device id printed in logcat the first time
        // the SDK runs on a device. Empty here — set per-dev in local debug.
        testingDevices: [],
      })

      // UMP: ask Google whether consent is required (EU + UK + Switzerland
      // currently). On other regions this returns NOT_REQUIRED and we skip
      // the form. Wrapped in its own try/catch so a consent failure doesn't
      // block ad serving in regions that don't need consent.
      try {
        const info = await AdMob.requestConsentInfo()
        if (
          info.isConsentFormAvailable &&
          info.status === AdmobConsentStatus.REQUIRED
        ) {
          await AdMob.showConsentForm()
        }
      } catch (consentErr) {
        console.error('[admob] consent flow failed', consentErr)
      }
    } catch (err) {
      console.error('[admob] initialize failed', err)
    }
  })()
  return initPromise
}

/**
 * Show the bottom-anchored adaptive banner. `marginPx` lets callers push the
 * banner above any fixed bottom UI (e.g. the mobile bottom nav, which is
 * ~56px tall on this app). The plugin renders the banner as a native view
 * *outside* the WebView, so it doesn't disturb React state.
 */
export async function showBottomBanner(marginPx: number = 0): Promise<void> {
  if (!isAndroidNative()) return
  try {
    const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob')
    await AdMob.showBanner({
      adId: process.env.NEXT_PUBLIC_ADMOB_BANNER_AD_ID || TEST_BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: marginPx,
      // Force test mode anywhere that isn't production-tagged so dev /
      // preview builds never serve real impressions.
      isTesting: process.env.NEXT_PUBLIC_ENV !== 'production',
    })
  } catch (err) {
    console.error('[admob] showBanner failed', err)
  }
}

export async function hideBottomBanner(): Promise<void> {
  if (!isAndroidNative()) return
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.hideBanner()
  } catch (err) {
    // Swallow — hideBanner throws if no banner is currently showing, which
    // happens during fast route transitions.
  }
}
