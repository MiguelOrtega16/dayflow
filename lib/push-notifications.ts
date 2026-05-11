import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { initLocalNotificationListeners } from '@/lib/activity-reminders'

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

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function initNativePush(userId: string) {
  // Only runs inside the native Android/iOS app — no-op in browser
  if (!Capacitor.isNativePlatform()) return

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

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
      const CALENDAR_TYPES = ['activity_invitation', 'invitation_accepted', 'status_update', 'task_completed', 'new_activity', 'activity_reminder', 'activity_30min_reminder']

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
