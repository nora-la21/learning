import { useEffect, useState } from 'react'
import { authStatus, login, register } from '../api/auth'

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6A17.7 17.7 0 0 0 2 13s3.5 7 10 7a9.7 9.7 0 0 0 4.5-1.1" />
      <path d="m2 2 20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupDisabled, setSignupDisabled] = useState(false)

  useEffect(() => {
    authStatus()
      .then(s => {
        setSignupDisabled(s.signup_disabled)
        // An empty server has nobody to sign in as, so offer to create the
        // first account — which also adopts any data that predates accounts.
        if (!s.has_accounts && !s.signup_disabled) setMode('signup')
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') await register(email.trim(), password)
      else await login(email.trim(), password)
      onLogin()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 transition-colors">
      <div className="bg-surface rounded-2xl border border-border p-10 w-full max-w-sm">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">
          Nederlands · vocabulary
        </p>
        <h1 className="text-2xl font-bold text-ink mb-1">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-muted text-sm mb-8">
          {isSignup
            ? 'Your words and progress stay private to your account.'
            : 'Sign in to pick up where you left off.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            autoComplete="email"
            className="w-full border border-border bg-surface text-ink rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ink transition-colors"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              className="w-full border border-border bg-surface text-ink rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:border-ink transition-colors"
            />
            {/* type="button" so it never submits the form, and tabIndex -1 so
                tabbing runs straight from the password to the submit button. */}
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-ghost hover:text-ink transition-colors"
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
          {isSignup && (
            <p className="text-xs text-ghost">At least 8 characters.</p>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-ink text-white font-medium rounded-xl py-3 text-sm hover:opacity-80 disabled:opacity-50 transition"
          >
            {loading ? '…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {!signupDisabled && (
          <p className="text-sm text-muted mt-6 text-center">
            {isSignup ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError('') }}
              className="text-accent hover:underline"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
