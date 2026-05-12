const API = 'http://localhost:8000/api'

// Load saved enabled state (default: true)
chrome.storage.local.get('dvh_enabled', v => {
  const enabled = v.dvh_enabled !== false
  const toggle = document.getElementById('enabled-toggle')
  toggle.checked = enabled
  updateLabel(enabled)
})

document.getElementById('enabled-toggle').addEventListener('change', e => {
  const enabled = e.target.checked
  chrome.storage.local.set({ dvh_enabled: enabled })
  updateLabel(enabled)
})

function updateLabel(enabled) {
  document.getElementById('toggle-label').textContent = enabled ? 'Popup enabled' : 'Popup disabled'
}

async function checkHealth() {
  const el = document.getElementById('status-text')
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      el.textContent = '✓ Connected'
      el.className = 'status-ok'
    } else {
      throw new Error()
    }
  } catch {
    el.textContent = '✗ App not running — start the backend first'
    el.className = 'status-err'
  }
}

checkHealth()
