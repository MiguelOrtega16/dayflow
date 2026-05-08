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
 * Cancels all previously scheduled reminders and reschedules fresh ones
 * for every activity in `activities` that has a start_time in the future.
 * No-op outside the native Capacitor app.
 */
export async function scheduleActivityReminders(activities: Activity[]) {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return

    await ensureChannel(LocalNotifications)

    // Cancel every previously scheduled reminder so edits / deletions are respected
    const { notifications: pending } = await LocalNotifications.getPending()
    if (pending.length > 0) {
      await LocalNotifications.cancel({ notifications: pending })
    }

    const now = Date.now()
    const toSchedule: LocalNotificationSchema[] = []

    for (const act of activities) {
      if (!act.start_time || !act.date) continue

      // Build a local Date from the activity's date + start_time
      const [h, m] = act.start_time.split(':').map(Number)
      const actDate = new Date(act.date + 'T00:00:00')
      actDate.setHours(h, m, 0, 0)

      const notifyAt = actDate.getTime() - 30 * 60 * 1000 // 30 min before
      if (notifyAt <= now) continue

      toSchedule.push({
        id:        uuidToIntId(act.id),
        title:     `⏰ En 30 minutos: ${act.emoji ? act.emoji + ' ' : ''}${act.title}`,
        body:      act.description?.trim() || 'Tu siguiente actividad se acerca. ¡Tú puedes! 💪',
        channelId: 'activity-reminders',
        schedule:  { at: new Date(notifyAt), allowWhileIdle: true },
        extra:     { type: 'activity_reminder', date: act.date, activityId: act.id },
      })
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule })
      console.log(`[ActivityReminders] scheduled ${toSchedule.length} reminder(s)`)
    }
  } catch (err) {
    console.error('[ActivityReminders] error:', err)
  }
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
