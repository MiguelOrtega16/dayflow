import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { initLocalNotificationListeners } from '@/lib/activity-reminders'

export async function initPushNotifications(userId: string) {
  // Start local-notification tap listener in parallel (independent of FCM)
  initLocalNotificationListeners()

  // Persist the device timezone so server-side crons fire at the right local time.
  // Runs on every platform (web + native); fire-and-forget.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  createClient()
    .from('profiles')
    .update({ timezone: tz })
    .eq('id', userId)
    .then(() => {})

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
