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

export async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string,
  body: string,
  data?: Record<string, string>,
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
      JSON.stringify({ title, body, data: { url: '/dashboard', ...data } }),
    )
  } catch (err: any) {
    // 410 Gone = subscription expired; caller should remove it from DB
    if (err?.statusCode !== 410) console.error('[WebPush] send error:', err?.message ?? err)
  }
}

export async function sendFCM(
  token: string,
  title: string,
  body: string,
  extraData?: Record<string, string>,
) {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return
  try {
    await messaging.send({
      token,
      notification: { title, body },
      data: { url: '/dashboard', ...extraData },
      android: { priority: 'high' },
      apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
    })
  } catch (err: any) {
    console.error('[FCM] send error:', err?.message ?? err)
  }
}
