import { Capacitor } from '@capacitor/core'
import type { LocalNotificationSchema } from '@capacitor/local-notifications'
import type { Activity } from '@/types'

// Convert a UUID to a stable 32-bit integer for use as a local notification ID
function uuidToIntId(uuid: string): number {
  let h = 0
  for (let i = 0; i < uuid.length; i++) h = (Math.imul(31, h) + uuid.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Channel created once on Android 8+ — safe to call multiple times
async function ensureChannel(LocalNotifications: any) {
  try {
    await LocalNotifications.createChannel({
      id:          'activity-reminders',
      name:        'Recordatorios de actividades',
      description: 'Avisos 30 minutos antes de cada actividad',
      importance:  4,  // IMPORTANCE_HIGH
      sound:       'default',
      vibration:   true,
    })
  } catch { /* channel already exists or not supported */ }
}

/**
 * Disabled: local notifications replaced with server-side FCM push.
 * Server-side notifications are more reliable on Android due to Doze mode + exact alarm handling.
 * Cron endpoint `/api/cron/activity-30min-reminders` sends FCM 30 minutes before each activity.
 * This function kept for backwards compatibility but is now a no-op.
 */
export async function scheduleActivityReminders(activities: Activity[]) {
  if (!Capacitor.isNativePlatform()) return
  // Activity reminders are now handled via server-side FCM push notifications
}

/** Wire up the tap handler so tapping a local reminder opens the right day. */
export async function initLocalNotificationListeners() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    LocalNotifications.addListener('localNotificationActionPerformed', (action: any) => {
      const extra: Record<string, string> = action.notification?.extra ?? {}
      const date = extra.date
      if (date) {
        sessionStorage.setItem('dayflow:gotoDate', date)
        window.location.href = '/dashboard'
      }
    })
  } catch (err) {
    console.error('[ActivityReminders] listener init error:', err)
  }
}
