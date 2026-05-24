import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { initLocalNotificationListeners } from '@/lib/activity-reminders'
import { SystemSettings } from '@/lib/system-settings'

export async function initPushNotifications(userId: string) {
  // Start local-notification tap listener in parallel (independent of FCM)
  initLocalNotificationListeners()

  // Persist timezone for server-side crons; fire-and-forget
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  createClient()
    .from('profiles')
    .update({ timezone: tz })
    .eq('id', userId)
    .then(() => {})

  if (Capacitor.isNativePlatform()) {
    // ── Native: register FCM via Capacitor ──────────────────────────────────
    await initNativePush(userId)
  } else {
    // ── Web: register service worker + Web Push ──────────────────────────────
    await initWebPush()
  }
}

async function initWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    await fetch('/api/web-push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
  } catch (err) {
    console.error('[WebPush] init error:', err)
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return new Uint8Array(Array.from(raw, c => c.charCodeAt(0)))
}

/**
 * Declare both reminder channels on Android. Channels are global per-app and
 * created once — subsequent createChannel calls with the same id are no-ops
 * (importance/sound/vibration are IMMUTABLE on Android once a channel exists,
 * so changing those values in code does nothing until the app is reinstalled).
 *
 * The FCM server picks between the two via android.notification.channel_id
 * based on the user's preferences.reminder_type. If a channel id is sent that
 * doesn't exist on the device, FCM silently falls back to the manifest-
 * declared default channel — which is why we also wire up
 * `default_notification_channel_id` in AndroidManifest pointing to
 * activity-reminders, so worst-case the notification still goes through a
 * HIGH-importance channel instead of Android's generic "Miscellaneous".
 *
 * Each createChannel runs in its own try/catch so a single failure doesn't
 * block the other channel.
 */
async function ensureReminderChannels() {
  if (!Capacitor.isNativePlatform()) return
  let LocalNotifications: typeof import('@capacitor/local-notifications').LocalNotifications
  try {
    LocalNotifications = (await import('@capacitor/local-notifications')).LocalNotifications
  } catch (err) {
    console.error('[Push] channel init: failed to import LocalNotifications', err)
    return
  }

  const tryCreate = async (cfg: Parameters<typeof LocalNotifications.createChannel>[0]) => {
    try {
      await LocalNotifications.createChannel(cfg)
      console.log('[Push] channel ensured:', cfg.id)
    } catch (err) {
      console.error('[Push] channel create failed:', cfg.id, err)
    }
  }

  await tryCreate({
    id:          'activity-reminders',
    name:        'Recordatorios de actividades',
    description: 'Notificaciones estándar para tus recordatorios',
    importance:  4,  // IMPORTANCE_HIGH
    sound:       'default',
    vibration:   true,
  })

  // Alarm channel: we use the SystemSettings native plugin instead of
  // LocalNotifications.createChannel because Capacitor's API doesn't expose
  // vibrationPattern, and the whole point of the alarm channel is to feel
  // distinctly different from a regular reminder. Triple-pulse + long buzz.
  // Versioned id: 'activity-alarms' (v1) shipped with the same default
  // vibration as activity-reminders, so it was indistinguishable in
  // practice. We delete the orphaned v1 to keep the user's notification-
  // settings list clean, then create v2 with the custom pattern.
  try {
    await SystemSettings.deleteChannel('activity-alarms')
  } catch { /* missing channel is fine */ }
  try {
    await SystemSettings.createAlarmChannel(
      'activity-alarms-v2',
      'Alarmas de actividades',
      'Alertas con vibración insistente para recordatorios tipo alarma',
    )
    console.log('[Push] channel ensured: activity-alarms-v2')
  } catch (err) {
    console.error('[Push] alarm channel create failed', err)
  }
}

async function initNativePush(userId: string) {
  // Only runs inside the native Android/iOS app — no-op in browser
  if (!Capacitor.isNativePlatform()) return

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    await ensureReminderChannels()

    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') return

    await PushNotifications.register()

    // Save the FCM token so the server can send pushes to this device
    PushNotifications.addListener('registration', async ({ value: token }) => {
      const supabase = createClient()
      await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId)
    })

    PushNotifications.addListener('registrationError', err => {
      console.error('[Push] registration error:', err)
    })

    // Notification arrives while app is open — refresh the bell
    PushNotifications.addListener('pushNotificationReceived', () => {
      window.dispatchEvent(new CustomEvent('dayflow:refresh'))
    })

    // User taps a notification from background/closed state — navigate to the right page
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      const data: Record<string, string> = action.notification?.data ?? {}
      const type = data.type ?? ''
      const date = data.date ?? ''

      const PEOPLE_TYPES = ['calendar_share_invite', 'calendar_share_accepted', 'calendar_share_declined']
      const CALENDAR_TYPES = ['activity_invitation', 'invitation_accepted', 'status_update', 'task_completed', 'new_activity', 'activity_reminder', 'activity_30min_reminder', 'activity_comment']

      if (PEOPLE_TYPES.includes(type)) {
        window.location.href = '/dashboard/people'
      } else if (CALENDAR_TYPES.includes(type)) {
        if (date) sessionStorage.setItem('dayflow:gotoDate', date)
        window.location.href = '/dashboard'
      } else {
        window.dispatchEvent(new CustomEvent('dayflow:refresh'))
      }
    })
  } catch (err) {
    console.error('[Push] init error:', err)
  }
}

// Called from API helpers — never blocks the calling action (fire-and-forget)
export async function sendPushNotification(payload: {
  recipientId: string
  title: string
  body: string
  type?: string
  date?: string
  activityId?: string
}) {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Push is best-effort — never block the main action
  }
}
