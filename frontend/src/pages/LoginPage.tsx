import { useEffect, useState } from 'react'
import { authStatus, login, register } from '../api/auth'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="w-full border border-border bg-surface text-ink rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ink transition-colors"
          />
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
