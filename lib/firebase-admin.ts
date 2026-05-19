let messagingInstance: import('firebase-admin/messaging').Messaging | null = null

export async function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getMessaging }                  = await import('firebase-admin/messaging')
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(raw)) })
    messagingInstance = getMessaging()
    return messagingInstance
  } catch (err) {
    console.error('[Firebase Admin] init error:', err)
    return null
  }
}

export interface WebPushAction { action: string; title: string }

export async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string,
  body: string,
  data?: Record<string, string>,
  actions?: WebPushAction[],
) {
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email      = process.env.VAPID_EMAIL || 'mailto:admin@day-flow.co'
  if (!publicKey || !privateKey) return
  try {
    const webpush = await import('web-push')
    webpush.default.setVapidDetails(email, publicKey, privateKey)
    await webpush.default.sendNotification(
      subscription,
      JSON.stringify({ title, body, data: { url: '/dashboard', ...data }, actions }),
    )
  } catch (err: any) {
    // 410 Gone = subscription expired; caller should remove it from DB
    if (err?.statusCode !== 410) console.error('[WebPush] send error:', err?.message ?? err)
  }
}

interface SendFCMOptions {
  /** Android notification channel id. If set, FCM routes the notification
   *  through this channel — used to escalate alarm-type reminders to a
   *  higher-importance channel with stronger vibration. */
  androidChannelId?: string
  /** Lock-screen visibility on Android. 'public' shows the full content
   *  (title + body) on the lock screen; 'private' shows it only after
   *  unlock; 'secret' hides it entirely. Defaults to the channel default
   *  when omitted. */
  androidVisibility?: 'private' | 'public' | 'secret'
  /** Optional notification sound for iOS. Android sound is governed by the
   *  channel; setting it here is a no-op on Android. */
  apnsSound?: string
  /** Treat as a high-urgency alarm (Android 7- only honors this; Android
   *  8+ the channel importance wins). On Android 7- we also set
   *  defaultVibrateTimings + defaultSound so the user feels the urgency
   *  even when their device has no notification channels. */
  alarm?: boolean
}

export async function sendFCM(
  token: string,
  title: string,
  body: string,
  extraData?: Record<string, string>,
  options?: SendFCMOptions,
) {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return
  try {
    // Build android.notification only if at least one Android-specific
    // option was provided, so the FCM v1 schema validator doesn't complain
    // about an empty object.
    const androidNotification: Record<string, unknown> = {}
    if (options?.androidChannelId)  androidNotification.channelId  = options.androidChannelId
    if (options?.androidVisibility) androidNotification.visibility = options.androidVisibility
    if (options?.alarm) {
      // notificationPriority is used only on Android 7-; Android 8+ uses
      // channel importance. defaultVibrateTimings + defaultSound similarly
      // are channel-overridden on 8+ but help on pre-8.
      androidNotification.notificationPriority = 'PRIORITY_MAX'
      androidNotification.defaultVibrateTimings = true
      androidNotification.defaultSound = true
    }
    const hasAndroidNotif = Object.keys(androidNotification).length > 0

    await messaging.send({
      token,
      notification: { title, body },
      data: { url: '/dashboard', ...extraData },
      android: {
        priority: 'high',
        ...(hasAndroidNotif ? { notification: androidNotification } : {}),
      },
      apns: { payload: { aps: { sound: options?.apnsSound ?? 'default', badge: 1 } } },
    })
  } catch (err: any) {
    console.error('[FCM] send error:', err?.message ?? err)
  }
}
