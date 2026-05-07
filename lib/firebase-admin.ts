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
