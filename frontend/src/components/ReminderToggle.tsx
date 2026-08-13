import { useEffect, useState } from 'react'

type State = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'blocked' | 'working'

/** Converts the base64url VAPID key the API serves into the buffer subscribe() wants. */
function urlBase64ToBuffer(value: string): BufferSource {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  // Backed by an explicit ArrayBuffer so it satisfies BufferSource.
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export default function ReminderToggle() {
  const [state, setState] = useState<State>('off')
  const [publicKey, setPublicKey] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    ;(async () => {
      try {
        const cfg = await fetch('/api/push/config').then(r => r.json())
        if (!cfg?.enabled) {
          setState('unconfigured')
          return
        }
        setPublicKey(cfg.public_key)
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        setState(sub ? 'on' : 'off')
      } catch {
        setState('unconfigured')
      }
    })()
  }, [])

  const enable = async () => {
    setState('working')
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setState('blocked')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      setState(res.ok ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }

  const disable = async () => {
    setState('working')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
    } finally {
      setState('off')
    }
  }

  // Nothing to offer if the browser can't do it or the server has no keys.
  if (state === 'unsupported' || state === 'unconfigured') return null

  if (state === 'blocked') {
    return (
      <span
        className="text-xs text-ghost px-3 py-2"
        title="Notifications are blocked for this site. Re-enable them in your browser's site settings."
      >🔕 Blocked</span>
    )
  }

  return (
    <button
      onClick={state === 'on' ? disable : enable}
      disabled={state === 'working'}
      className={`px-3 py-2 rounded-lg border text-xs font-medium transition disabled:opacity-50 ${
        state === 'on'
          ? 'border-ink text-ink'
          : 'border-border text-muted hover:text-ink hover:border-ink'
      }`}
      title={state === 'on'
        ? 'Daily reminder is on — click to turn it off'
        : 'Get a daily reminder when words are due for review'}
    >
      {state === 'working' ? '…' : state === 'on' ? '🔔 Reminders on' : '🔔 Remind me'}
    </button>
  )
}
