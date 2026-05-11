// DayFlow Service Worker — handles web push notifications
self.addEventListener('push', event => {
  if (!event.data) return
  let payload = {}
  try { payload = event.data.json() } catch { payload = { title: 'DayFlow', body: event.data.text() } }

  const title   = payload.title || 'DayFlow'
  const options = {
    body:    payload.body  || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    data:    payload.data  || {},
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/dashboard'))
      if (existing) { existing.focus(); existing.navigate(url) }
      else clients.openWindow(url)
    })
  )
})
