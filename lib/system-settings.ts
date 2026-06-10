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
  createAlarmChannel(opts: { id: string; name: string; description?: string }): Promise<void>
  createReminderChannel(opts: { id: string; name: string; description?: string; sound?: string }): Promise<void>
  previewSound(opts: { sound?: string }): Promise<void>
  deleteChannel(opts: { id: string }): Promise<void>
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

  createAlarmChannel: (id: string, name: string, description?: string) =>
    isSystemSettingsSupported()
      ? native.createAlarmChannel({ id, name, description })
      : Promise.resolve(),

  /** Create a standard reminder channel whose sound is the given res/raw
   *  resource (no extension), e.g. 'notif_ding'. Omit `sound` for the system
   *  default. No-op off Android. */
  createReminderChannel: (id: string, name: string, description?: string, sound?: string) =>
    isSystemSettingsSupported()
      ? native.createReminderChannel({ id, name, description, sound })
      : Promise.resolve(),

  /** Preview a res/raw sound (no extension) through the notification audio
   *  stream so it matches real notification loudness. No-op off Android. */
  previewSound: (sound?: string) =>
    isSystemSettingsSupported() ? native.previewSound({ sound }) : Promise.resolve(),

  deleteChannel: (id: string) =>
    isSystemSettingsSupported()
      ? native.deleteChannel({ id })
      : Promise.resolve(),
}
