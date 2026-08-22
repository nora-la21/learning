import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import ReminderToggle from './ReminderToggle'
import { getEmail, logout } from '../api/auth'

const SECTIONS = [
  { to: '/', label: 'Vocabulary' },
  { to: '/verbs', label: 'Irregular verbs' },
  { to: '/stats', label: 'Progress' },
]

/** Top bar: the sections on the left, the account menu on the right. */
export default function NavMenu() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => { setOpen(false) }, [pathname])

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <nav className="flex items-center gap-1 min-w-0">
          <Link to="/" className="text-[13px] font-semibold text-ink mr-3 shrink-0">
            🇳🇱 Nederlands
          </Link>
          {SECTIONS.map(s => (
            <Link
              key={s.to}
              to={s.to}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                isActive(s.to)
                  ? 'bg-ink text-onink font-medium'
                  : 'text-muted hover:text-ink'
              }`}
            >{s.label}</Link>
          ))}
        </nav>

        <div className="relative flex items-center gap-2 shrink-0" ref={menu}>
          <ThemeToggle />
          <ReminderToggle />
          <button
            onClick={() => setOpen(v => !v)}
            className="w-8 h-8 rounded-full bg-ink text-onink text-xs font-semibold flex items-center justify-center"
            title={getEmail() ?? 'Account'}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {(getEmail() ?? '?').slice(0, 1).toUpperCase()}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-11 w-60 bg-surface border border-border rounded-xl shadow-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] uppercase tracking-[.14em] text-ghost">Signed in as</p>
                <p className="text-sm text-ink truncate">{getEmail() ?? '—'}</p>
              </div>
              <Link to="/profile" role="menuitem"
                className="block px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors">
                My profile
              </Link>
              <Link to="/stats" role="menuitem"
                className="block px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors">
                Progress &amp; statistics
              </Link>
              <Link to="/settings" role="menuitem"
                className="block px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors">
                Settings
              </Link>
              <button
                role="menuitem"
                onClick={logout}
                className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-paper transition-colors border-t border-border"
              >Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
