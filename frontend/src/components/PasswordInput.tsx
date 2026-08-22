import { useState } from 'react'

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

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  autoFocus?: boolean
}

/** A password field with a show/hide eye, so it behaves the same everywhere. */
export default function PasswordInput({
  value, onChange, placeholder = 'Password', autoComplete, autoFocus,
}: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full border border-border bg-surface text-ink rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:border-ink transition-colors"
      />
      {/* type="button" so it never submits the form, and tabIndex -1 so tabbing
          runs straight from the password to the submit button. */}
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-ghost hover:text-ink transition-colors"
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  )
}
