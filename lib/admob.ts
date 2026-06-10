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

// Hard kill-switch. Banners and the UMP consent flow stay dormant until
// NEXT_PUBLIC_ENABLE_ADS is set to '1' at build time. Lets the production
// publish ship with ads-off, then a single env-var flip + rebuild turns
// them on — no code churn, no risk of forgetting to mount a component.
const adsEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_ADS === '1'

let initPromise: Promise<void> | null = null

/**
 * Initialize AdMob + run the UMP consent flow once per app launch. Safe to
 * call from multiple places — the promise is cached.
 */
export function initAdMob(): Promise<void> {
  if (!adsEnabled()) return Promise.resolve()
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
  if (!adsEnabled()) return
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

/**
 * Whether the UMP "privacy options" entry point should be offered to this user
 * — i.e. they're in a region (EEA / UK / Switzerland) where they must be able
 * to change or withdraw ad-consent later. Drives the visibility of the in-app
 * "Manage consent" control. Returns false off native Android or when ads are
 * disabled (no consent was ever gathered).
 */
export async function isPrivacyOptionsRequired(): Promise<boolean> {
  if (!adsEnabled() || !isAndroidNative()) return false
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    const info = await AdMob.requestConsentInfo()
    // The plugin doesn't re-export the PrivacyOptionsRequirementStatus enum from
    // its root, but it's a string enum whose REQUIRED value is the literal
    // 'REQUIRED'. Compare via String() to stay type-safe.
    return String(info.privacyOptionsRequirementStatus) === 'REQUIRED'
  } catch (err) {
    console.error('[admob] privacy-options check failed', err)
    return false
  }
}

/**
 * Re-open the UMP privacy-options form so the user can change or withdraw their
 * ad-consent choices — the in-app equivalent of a consent "revocation link",
 * required for GDPR once we serve ads in the EEA. No-op off native Android.
 */
export async function showPrivacyOptions(): Promise<void> {
  if (!isAndroidNative()) return
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.showPrivacyOptionsForm()
  } catch (err) {
    console.error('[admob] showPrivacyOptionsForm failed', err)
  }
}

export async function hideBottomBanner(): Promise<void> {
  if (!isAndroidNative()) return
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    // removeBanner (destroy) — NOT hideBanner (which is a temporary hide
    // meant to be paired with resumeBanner). Pairing hideBanner with
    // showBanner on the next mount leaves the plugin holding a stale hidden
    // banner reference, and after the user clicks an ad (which transitions
    // the banner through Opened/Closed events) subsequent showBanner calls
    // silently fail to render. removeBanner forces a clean teardown so each
    // page mount gets a fresh ad request.
    await AdMob.removeBanner()
  } catch (err) {
    // Swallow — removeBanner throws if no banner exists, which happens
    // during fast route transitions or after a failed showBanner.
  }
}
