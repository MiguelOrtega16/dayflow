import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

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
export const MIN_SUPPORTED_VERSION_CODE = Number(
  process.env.NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE ?? '0',
)

// Play Core constants — mirror com.google.android.play.core.install.model.*
// to avoid importing native types into the JS layer.
const UPDATE_AVAILABILITY_AVAILABLE = 2
const INSTALL_STATUS_DOWNLOADED = 11

/**
 * Read the installed app's versionCode via `@capacitor/app`. This is the
 * authoritative source — works even when Play Core is unavailable (emulator,
 * sideloaded APK, devices without Play Services). Returns 0 when the value
 * can't be read, which the caller should treat as "skip the forced check".
 *
 * Why not Play Core's `info.currentVersionCode`?  Because Play Core won't
 * return *any* info when `updateAvailability !== AVAILABLE`, and that branch
 * fires for users not yet rolled into a testing track — the population we
 * most need to gate. App.getInfo() reports the build regardless.
 */
export async function getInstalledVersionCode(): Promise<number> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 0
  try {
    const info = await CapacitorApp.getInfo()
    return Number(info.build ?? '0') || 0
  } catch {
    return 0
  }
}

/**
 * Open the Play Store listing for this app. Used by the forced-update modal.
 * We prefer Play Core's `performImmediateUpdate` when available (gives Google's
 * native blocking UI + auto-restart), and fall back to opening the listing.
 */
export async function openStoreForUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update')
    try {
      const info = await AppUpdate.getAppUpdateInfo()
      if (
        info.updateAvailability === UPDATE_AVAILABILITY_AVAILABLE &&
        info.immediateUpdateAllowed
      ) {
        await AppUpdate.performImmediateUpdate()
        return
      }
    } catch {
      // Play Core unavailable — fall through to openAppStore.
    }
    await AppUpdate.openAppStore()
  } catch (err) {
    console.error('[VersionCheck] openStoreForUpdate failed', err)
  }
}

/**
 * Trigger Play Store's *flexible* update flow on Android when a newer APK is
 * available — background download with a Google-rendered banner; we surface
 * the restart-to-install confirmation when the download finishes. Web / iOS
 * and the forced-update case are no-ops; the forced case is owned by
 * <ForceUpdateGate/> in the dashboard shell.
 */
export async function initVersionCheck(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return

  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update')
    const info = await AppUpdate.getAppUpdateInfo()

    if (info.updateAvailability !== UPDATE_AVAILABILITY_AVAILABLE) return
    if (!info.flexibleUpdateAllowed) return

    // Listen first so we don't miss the DOWNLOADED transition.
    await AppUpdate.addListener('onFlexibleUpdateStateChange', state => {
      if (state.installStatus === INSTALL_STATUS_DOWNLOADED) {
        AppUpdate.completeFlexibleUpdate().catch(err =>
          console.error('[VersionCheck] completeFlexibleUpdate failed', err),
        )
      }
    })
    await AppUpdate.startFlexibleUpdate()
  } catch (err) {
    // Non-fatal: emulator without Play Services, transient network failure,
    // plugin not yet synced. Logging only — never block dashboard load.
    console.error('[VersionCheck] init error:', err)
  }
}
