/* Service worker for review reminders.
 *
 * Pushes arrive with no payload — encrypting one would mean shipping extra
 * crypto on the server for no benefit, since this worker can simply ask the API
 * how many words are due when it wakes. The push is only a wake-up.
 */

const FALLBACK = 'You have words ready to review.'

async function buildMessage() {
  try {
    const res = await fetch('/api/progress/due', { cache: 'no-store' })
    if (!res.ok) return FALLBACK
    const { total } = await res.json()
    if (!total) return null // nothing due after all; stay quiet
    return `${total} ${total === 1 ? 'word is' : 'words are'} ready to review.`
  } catch {
    return FALLBACK
  }
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    const body = await buildMessage()
    if (body === null) return
    await self.registration.showNotification('Time to practise', {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'due-review',        // collapse repeats instead of stacking
      renotify: false,
      data: { url: '/' },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window', includeUncontrolled: true,
    })
    // Focus an open tab rather than piling up new ones.
    for (const client of clientList) {
      if ('focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow('/')
  })())
})
