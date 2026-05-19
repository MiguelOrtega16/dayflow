import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Opens Android system settings pages and checks system-level toggles
 * (notification permission, battery-optimization exemption).
 *
 * No-ops on web; the troubleshoot page falls back to browser Notification
 * API there.
 */
interface SystemSettingsPlugin {
  openAppNotificationSettings(): Promise<void>
  openBatteryOptimizationSettings(): Promise<void>
  openAutoStartSettings(): Promise<void>
  checkBatteryOptimization(): Promise<{ ignoring: boolean }>
  checkNotificationsEnabled(): Promise<{ enabled: boolean }>
}

const native = registerPlugin<SystemSettingsPlugin>('SystemSettings')

export function isSystemSettingsSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export const SystemSettings = {
  openAppNotificationSettings: () =>
    isSystemSettingsSupported() ? native.openAppNotificationSettings() : Promise.resolve(),

  openBatteryOptimizationSettings: () =>
    isSystemSettingsSupported() ? native.openBatteryOptimizationSettings() : Promise.resolve(),

  openAutoStartSettings: () =>
    isSystemSettingsSupported() ? native.openAutoStartSettings() : Promise.resolve(),

  checkBatteryOptimization: (): Promise<{ ignoring: boolean }> =>
    isSystemSettingsSupported()
      ? native.checkBatteryOptimization()
      : Promise.resolve({ ignoring: true }),

  checkNotificationsEnabled: (): Promise<{ enabled: boolean }> =>
    isSystemSettingsSupported()
      ? native.checkNotificationsEnabled()
      : Promise.resolve({ enabled: true }),
}
