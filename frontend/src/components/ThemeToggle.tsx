import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'ledger' | 'classic'>(() => {
    return (localStorage.getItem('app-theme') as 'ledger' | 'classic') ?? 'ledger'
  })

  useEffect(() => {
    if (theme === 'classic') {
      document.documentElement.setAttribute('data-theme', 'classic')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem('app-theme', theme)
  }, [theme])

  // Apply theme on mount from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('app-theme')
    if (stored === 'classic') {
      document.documentElement.setAttribute('data-theme', 'classic')
    }
  }, [])

  return (
    <button
      onClick={() => setTheme(t => t === 'ledger' ? 'classic' : 'ledger')}
      className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-ink hover:border-ink transition-colors"
      title="Switch theme"
    >
      {theme === 'ledger' ? 'Classic' : 'Ledger'}
    </button>
  )
}
