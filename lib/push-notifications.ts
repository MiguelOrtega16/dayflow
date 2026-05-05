import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'

export async function initPushNotifications(userId: string) {
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

    // User taps a notification from background/closed state
    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      window.dispatchEvent(new CustomEvent('dayflow:refresh'))
    })
  } catch (err) {
    console.error('[Push] init error:', err)
  }
}

// Called server-side via the /api/send-push route
export async function sendPushNotification(payload: {
  recipientId: string
  title: string
  body: string
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
