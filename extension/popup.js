const DEFAULT_SERVER = 'https://learning-steel-ten.vercel.app'

async function getServerUrl() {
  return new Promise(res =>
    chrome.storage.local.get('dvh_server', v =>
      res((v.dvh_server || DEFAULT_SERVER).replace(/\/$/, ''))
    )
  )
}

// Load saved state
chrome.storage.local.get(['dvh_enabled', 'dvh_server'], v => {
  const enabled = v.dvh_enabled !== false
  const server = v.dvh_server || DEFAULT_SERVER

  const toggle = document.getElementById('enabled-toggle')
  toggle.checked = enabled
  updateLabel(enabled)

  document.getElementById('server-url').value = server
  document.getElementById('open-app').href = server
})

document.getElementById('enabled-toggle').addEventListener('change', e => {
  const enabled = e.target.checked
  chrome.storage.local.set({ dvh_enabled: enabled })
  updateLabel(enabled)
})

document.getElementById('server-url').addEventListener('change', e => {
  const server = e.target.value.trim().replace(/\/$/, '')
  chrome.storage.local.set({ dvh_server: server })
  document.getElementById('open-app').href = server
  checkHealth()
})

function updateLabel(enabled) {
  document.getElementById('toggle-label').textContent = enabled ? 'Popup enabled' : 'Popup disabled'
}

function getToken() {
  return new Promise(res => chrome.storage.local.get('dvh_token', v => res(v.dvh_token || '')))
}

async function ping(server, ms) {
  const r = await fetch(`${server}/api/health`, { signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return true
}

/** The server being up is not enough — saving a word needs a valid account. */
async function checkAccount(server) {
  const token = await getToken()
  if (!token) return 'no-token'
  const r = await fetch(`${server}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  return r.ok ? 'ok' : 'bad-token'
}

async function checkHealth() {
  const el = document.getElementById('status-text')
  const server = await getServerUrl()

  el.textContent = 'Checking…'
  el.className = ''
  try {
    // A sleeping free-tier backend needs ~30-60s to wake, far longer than a
    // healthy reply takes. Probe briefly first so the common case stays snappy,
    // then wait out a cold start rather than calling it unreachable.
    try {
      await ping(server, 4000)
    } catch {
      el.textContent = '⏳ Waking server… (up to 60s)'
      el.className = ''
      await ping(server, 60000)
    }
    const account = await checkAccount(server)
    if (account === 'no-token') {
      el.textContent = '⚠ Open the app and sign in'
      el.className = 'status-err'
      return
    }
    if (account === 'bad-token') {
      el.textContent = '⚠ Session expired — open the app and sign in'
      el.className = 'status-err'
      return
    }
    el.textContent = '✓ Connected'
    el.className = 'status-ok'
  } catch {
    el.textContent = '✗ Not reachable'
    el.className = 'status-err'
  }
}

checkHealth()
