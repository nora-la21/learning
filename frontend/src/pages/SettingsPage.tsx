import { useState } from 'react'
import NavMenu from '../components/NavMenu'
import ThemeToggle from '../components/ThemeToggle'
import ReminderToggle from '../components/ReminderToggle'
import PasswordInput from '../components/PasswordInput'
import { api } from '../api/client'
import { authHeaders, changePassword } from '../api/auth'

function Section({ title, blurb, children }: {
  title: string; blurb: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="text-sm text-muted mt-0.5 mb-4">{blurb}</p>
      {children}
    </div>
  )
}

function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== repeat) { setNote('The two new passwords do not match.'); return }
    if (next.length < 8) { setNote('At least 8 characters.'); return }
    setBusy(true); setNote('')
    try {
      await changePassword(current, next)
      setNote('Password changed. Other devices have been signed out.')
      setCurrent(''); setNext(''); setRepeat('')
    } catch (err: any) {
      setNote(err.message || 'Could not change the password')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <PasswordInput value={current} onChange={setCurrent}
        placeholder="Current password" autoComplete="current-password" />
      <PasswordInput value={next} onChange={setNext}
        placeholder="New password" autoComplete="new-password" />
      <PasswordInput value={repeat} onChange={setRepeat}
        placeholder="Repeat new password" autoComplete="new-password" />
      <button
        type="submit"
        disabled={busy || !current || !next}
        className="px-4 py-2 bg-ink text-onink rounded-lg text-sm font-medium hover:opacity-80 disabled:opacity-50 transition"
      >{busy ? '…' : 'Change password'}</button>
      {note && <p className="text-sm text-muted">{note}</p>}
    </form>
  )
}

export default function SettingsPage() {
  const [msg, setMsg] = useState('')

  const handleExport = async () => {
    setMsg('Preparing…')
    try {
      const res = await fetch('/api/export', { headers: authHeaders() })
      if (!res.ok) throw new Error()
      // Anchor download rather than navigation, so the auth key stays out of history.
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `vocabulary-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Downloaded')
    } catch {
      setMsg('Export failed')
    }
    setTimeout(() => setMsg(''), 4000)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setMsg('Importing…')
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: authHeaders(), body: form })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setMsg(`Imported ${data?.words_added ?? 0} words, ${data?.progress_restored ?? 0} progress entries`)
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setMsg(data?.detail || 'Import failed')
      }
    } catch {
      setMsg('Import failed')
    }
    e.target.value = ''
  }

  const resetWords = async () => {
    if (!confirm(
      'Reset all vocabulary progress?\n\n' +
      'Your word lists are kept. Practice history, mastery, streak and the ' +
      'review schedule are erased. This cannot be undone.'
    )) return
    setMsg('Resetting…')
    try {
      await api.resetAllProgress()
      setMsg('Vocabulary progress reset')
      setTimeout(() => window.location.reload(), 800)
    } catch { setMsg('Reset failed') }
  }

  const resetVerbs = async () => {
    if (!confirm('Reset irregular-verb progress? This cannot be undone.')) return
    setMsg('Resetting…')
    try {
      await api.resetVerbProgress()
      setMsg('Verb progress reset')
    } catch { setMsg('Reset failed') }
  }

  const button = 'px-4 py-2 border border-border text-muted rounded-lg text-sm font-medium ' +
                 'hover:text-ink hover:border-ink transition'
  const danger = 'px-4 py-2 border border-border text-muted rounded-lg text-sm font-medium ' +
                 'hover:text-red-500 hover:border-red-500 transition'

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">Account</p>
        <h1 className="text-3xl font-bold text-ink mb-6">Settings</h1>

        <Section title="Password"
                 blurb="Changing it signs out every other device. There is no email reset, so pick something you will remember.">
          <ChangePassword />
        </Section>

        <Section title="Appearance" blurb="Switch between the light, classic and dark themes.">
          <ThemeToggle />
        </Section>

        <Section title="Daily reminder"
                 blurb="A browser notification when words are due for review.">
          <ReminderToggle />
        </Section>

        <Section title="Your data"
                 blurb="Download everything you have added and practised, or restore it from a file.">
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExport} className={button}>⬇ Export</button>
            <label className={`${button} cursor-pointer`}>
              ⬆ Import
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </Section>

        <Section title="Start over"
                 blurb="Erase practice history and begin from zero. Word lists are kept.">
          <div className="flex gap-2 flex-wrap">
            <button onClick={resetWords} className={danger}>Reset vocabulary progress</button>
            <button onClick={resetVerbs} className={danger}>Reset verb progress</button>
          </div>
        </Section>

        {msg && <p className="text-sm text-ghost">{msg}</p>}
      </div>
    </div>
  )
}
