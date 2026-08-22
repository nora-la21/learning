import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import NavMenu from '../components/NavMenu'
import { api } from '../api/client'
import { fetchMe, logout } from '../api/auth'
import type { DueSummary, VerbSummary, WordList } from '../types'

export default function ProfilePage() {
  const [me, setMe] = useState<{ id: number; email: string } | null>(null)
  const [lists, setLists] = useState<WordList[]>([])
  const [due, setDue] = useState<DueSummary | null>(null)
  const [verbs, setVerbs] = useState<VerbSummary | null>(null)

  useEffect(() => {
    fetchMe().then(setMe).catch(() => {})
    api.getLists().then(setLists).catch(() => {})
    api.getDue().then(setDue).catch(() => {})
    api.getVerbSummary().then(setVerbs).catch(() => {})
  }, [])

  const mastered = lists.reduce((n, l) => n + (l.mastered_count || 0), 0)
  const myLists = lists.filter(l => !l.builtin).length
  const verbsMastered = verbs
    ? verbs.modes.filter(m => m.mode !== 'meaning').reduce((n, m) => n + m.mastered, 0)
    : 0

  const rows: [string, string | number][] = [
    ['Email', me?.email ?? '—'],
    ['Words mastered', mastered],
    ['Verb forms mastered', verbsMastered],
    ['Due for review', due?.total ?? 0],
    ['Lists you created', myLists],
  ]

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">Account</p>
        <h1 className="text-3xl font-bold text-ink mb-6">My profile</h1>

        <div className="bg-surface rounded-2xl border border-border overflow-hidden mb-4">
          <div className="flex items-center gap-4 p-5 border-b border-border">
            <div className="w-12 h-12 rounded-full bg-ink text-white font-semibold flex items-center justify-center text-lg">
              {(me?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-ink font-semibold truncate">{me?.email ?? '…'}</p>
              <p className="text-sm text-muted">Learning Dutch</p>
            </div>
          </div>
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between px-5 py-3 border-b border-border last:border-0">
              <span className="text-sm text-muted">{label}</span>
              <span className="text-sm text-ink font-medium">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link to="/stats"
            className="px-4 py-2 border border-border text-muted rounded-lg text-sm font-medium hover:text-ink hover:border-ink transition">
            Progress &amp; statistics
          </Link>
          <Link to="/settings"
            className="px-4 py-2 border border-border text-muted rounded-lg text-sm font-medium hover:text-ink hover:border-ink transition">
            Settings
          </Link>
          <button onClick={logout}
            className="px-4 py-2 border border-border text-muted rounded-lg text-sm font-medium hover:text-red-500 hover:border-red-500 transition">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
