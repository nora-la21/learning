const API = 'http://localhost:8000/api'

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
