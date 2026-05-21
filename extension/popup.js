const DEFAULT_SERVER = 'https://learning-production-fbb6.up.railway.app'

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

async function checkHealth() {
  const el = document.getElementById('status-text')
  const server = await getServerUrl()
  try {
    const r = await fetch(`${server}/api/health`, { signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      el.textContent = '✓ Connected'
      el.className = 'status-ok'
    } else {
      throw new Error()
    }
  } catch {
    el.textContent = '✗ Not reachable'
    el.className = 'status-err'
  }
}

checkHealth()
