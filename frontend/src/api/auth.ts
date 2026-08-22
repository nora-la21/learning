const TOKEN_KEY = 'auth-token'
const EMAIL_KEY = 'auth-email'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY)
}

export function setSession(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Called when the server rejects our token, e.g. after it expires. */
export function onUnauthorized() {
  clearSession()
  // Full reload rather than router navigation, so no stale page state survives.
  if (window.location.pathname !== '/') window.location.href = '/'
  else window.location.reload()
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail || 'Something went wrong')
  return data
}

export async function register(email: string, password: string) {
  const data = await post('/api/auth/register', { email, password })
  setSession(data.token, data.email)
  return data
}

export async function login(email: string, password: string) {
  const data = await post('/api/auth/login', { email, password })
  setSession(data.token, data.email)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return post('/api/auth/change-password', {
    current_password: currentPassword, new_password: newPassword,
  })
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() })
  } finally {
    clearSession()
    window.location.href = '/'
  }
}

export async function fetchMe(): Promise<{ id: number; email: string } | null> {
  if (!getToken()) return null
  const res = await fetch('/api/auth/me', { headers: authHeaders() })
  if (!res.ok) {
    clearSession()
    return null
  }
  return res.json()
}

export async function authStatus(): Promise<{ signup_disabled: boolean; has_accounts: boolean }> {
  const res = await fetch('/api/auth/status')
  if (!res.ok) throw new Error('Cannot reach the server')
  return res.json()
}
