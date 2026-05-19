import { Capacitor } from '@capacitor/core'

/**
 * Bump this whenever a release introduces a server-side change that older
 * clients cannot handle (e.g. schema migration, removed API endpoint, breaking
 * notification payload). Users whose installed versionCode is below this value
 * get a blocking full-screen update prompt that they cannot dismiss until they
 * update. Set in Vercel as NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE.
 *
 * Soft updates (when a newer version exists on Play Store but the user's
 * version is still >= min) happen automatically via Play Core's flexible flow
 * — no constant to bump for those, Google figures it out.
 */
const MIN_SUPPORTED_VERSION_CODE = Number(
  process.env.NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE ?? '0',
)

// Play Core constants — mirror com.google.android.play.core.install.model.*
// to avoid importing native types into the JS layer.
const UPDATE_AVAILABILITY_AVAILABLE = 2
const INSTALL_STATUS_DOWNLOADED = 11

/**
 * Check Play Store for a newer APK and prompt the user. Android-only; web and
 * iOS are no-ops. Safe to call on every dashboard mount — Play Core caches the
 * check and the plugin throws cleanly on emulators without Play Services
 * (which we swallow).
 *
 * Flow:
 *   1. Ask Play Core if an update is available.
 *   2. If installed versionCode < MIN_SUPPORTED → perform an *immediate* update
 *      (Google's full-screen blocking UI; app restarts when done). Falls back
 *      to opening the Play Store listing if the device doesn't allow immediate.
 *   3. Otherwise → start a *flexible* update (background download with a small
 *      Google-rendered banner). When the APK finishes downloading we surface
 *      the restart-to-install confirmation via completeFlexibleUpdate().
 */
export async function initVersionCheck(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return

  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update')
    const info = await AppUpdate.getAppUpdateInfo()

    if (info.updateAvailability !== UPDATE_AVAILABILITY_AVAILABLE) return

    const currentCode = Number(info.currentVersionCode ?? '0')
    const isForced =
      MIN_SUPPORTED_VERSION_CODE > 0 &&
      currentCode > 0 &&
      currentCode < MIN_SUPPORTED_VERSION_CODE

    if (isForced) {
      if (info.immediateUpdateAllowed) {
        await AppUpdate.performImmediateUpdate()
      } else {
        // Device blocks immediate updates (rare, e.g. some OEM Play Store
        // forks). Fall back to opening the listing so the user can update
        // manually — better than silently letting them keep using an
        // incompatible client.
        await AppUpdate.openAppStore()
      }
      return
    }

    if (info.flexibleUpdateAllowed) {
      // Listen first so we don't miss the DOWNLOADED transition.
      await AppUpdate.addListener('onFlexibleUpdateStateChange', state => {
        if (state.installStatus === INSTALL_STATUS_DOWNLOADED) {
          AppUpdate.completeFlexibleUpdate().catch(err =>
            console.error('[VersionCheck] completeFlexibleUpdate failed', err),
          )
        }
      })
      await AppUpdate.startFlexibleUpdate()
    }
  } catch (err) {
    // Non-fatal: emulator without Play Services, transient network failure,
    // plugin not yet synced. Logging only — never block dashboard load.
    console.error('[VersionCheck] init error:', err)
  }
}
