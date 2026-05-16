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
  if (Array.isArray(payload.actions) && payload.actions.length > 0) {
    options.actions = payload.actions
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}
  let url = data.url || '/dashboard'

  // Action-button click — append the relevant query so the page can react on load
  if (event.action === 'create') {
    const date = data.date ? `?create=${encodeURIComponent(data.date)}` : '?create=today'
    url = `/dashboard${date}`
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/dashboard'))
      if (existing) { existing.focus(); existing.navigate(url) }
      else clients.openWindow(url)
    })
  )
})
