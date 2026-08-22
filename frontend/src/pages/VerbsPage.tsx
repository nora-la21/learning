import { useEffect, useState } from 'react'
import NavMenu from '../components/NavMenu'
import VerbGame from '../components/VerbGame'
import { api } from '../api/client'
import type { IrregularVerb, VerbSummary, VerbMode } from '../types'

const MODES: { id: VerbMode; label: string; blurb: string; chip: string }[] = [
  { id: 'past_singular', label: 'Past — singular', chip: '01',
    blurb: 'ik brak — the singular past of the verb' },
  { id: 'past_plural', label: 'Past — plural', chip: '02',
    blurb: 'wij braken — the plural past, which differs from the singular' },
  { id: 'participle', label: 'Past participle', chip: '03',
    blurb: 'gebroken — the form used with hebben or zijn' },
  { id: 'auxiliary', label: 'Auxiliary verb', chip: '04',
    blurb: 'hebben or zijn — pick the one this verb takes' },
  { id: 'all_forms', label: 'All forms', chip: '01–04',
    blurb: 'Every column of the table, one verb at a time' },
]

export default function VerbsPage() {
  const [verbs, setVerbs] = useState<IrregularVerb[]>([])
  const [summary, setSummary] = useState<VerbSummary | null>(null)
  const [mode, setMode] = useState<VerbMode | null>(null)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [showTable, setShowTable] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([api.getVerbs(), api.getVerbSummary()])
      .then(([v, s]) => { setVerbs(v); setSummary(s) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (mode) {
    return (
      <div className="min-h-screen bg-paper transition-colors">
        <NavMenu />
        <div className="max-w-xl mx-auto px-4 py-10">
          <VerbGame mode={mode} sessionSize={size} onBack={() => { setMode(null); load() }} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">
          Sterke werkwoorden
        </p>
        <h1 className="text-3xl font-bold text-ink mb-1">Irregular verbs</h1>
        <p className="text-muted text-sm mb-6">
          {summary?.total_verbs ?? '…'} verbs. Each form is drilled separately, so
          knowing the participle does not excuse you from the plural past.
        </p>

        {summary && summary.due > 0 && (
          <div className="bg-ink rounded-2xl p-5 mb-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[.15em] text-white/50 font-medium mb-1">
                Due for review
              </p>
              <p className="text-white text-[22px] font-semibold leading-tight">
                {summary.due} {summary.due === 1 ? 'form' : 'forms'} ready
              </p>
            </div>
            <button
              onClick={() => setMode('all_forms')}
              className="px-5 py-2.5 bg-white text-ink rounded-[9px] text-sm font-semibold hover:opacity-90 transition"
            >Review now →</button>
          </div>
        )}

        {/* Per-mode mastery */}
        {summary && (
          <div className="bg-surface rounded-2xl border border-border mb-6 grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
            {summary.modes.filter(m => m.mode !== 'meaning').map(m => (
              <div key={m.mode} className="p-4 text-center">
                <div className="text-[22px] font-semibold text-ink">
                  {m.mastered}
                  <span className="text-ghost text-sm font-normal">/{summary.total_verbs}</span>
                </div>
                <div className="text-[10px] uppercase tracking-[.12em] text-ghost mt-0.5">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Session size */}
        <div className="bg-surface rounded-2xl border border-border p-4 mb-3">
          <p className="text-[11px] uppercase tracking-[.14em] text-ghost font-medium mb-3">
            Verbs per session
          </p>
          <div className="flex gap-2 flex-wrap">
            {[5, 10, 20, 40].map(n => (
              <button
                key={n}
                onClick={() => setSize(n)}
                className={`px-3 py-1.5 rounded-[9px] text-sm font-semibold border transition-colors ${
                  size === n ? 'bg-ink text-white border-ink'
                             : 'bg-surface border-border text-muted hover:border-muted'
                }`}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Modes */}
        <div className="space-y-3 mb-8">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`w-full rounded-[14px] border p-4 flex items-center gap-4 hover:shadow-md transition-all text-left group ${
                m.id === 'all_forms' ? 'bg-ink border-ink' : 'bg-surface border-border hover:border-muted'
              }`}
            >
              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded border shrink-0 border-accent text-accent">
                {m.chip}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${m.id === 'all_forms' ? 'text-white' : 'text-ink'}`}>
                  {m.label}
                </div>
                <div className={`text-sm ${m.id === 'all_forms' ? 'text-white/70' : 'text-muted'}`}>
                  {m.blurb}
                </div>
              </div>
              <span className={m.id === 'all_forms' ? 'text-white/60' : 'text-ghost group-hover:text-accent'}>→</span>
            </button>
          ))}
        </div>

        {/* The table itself */}
        <button
          onClick={() => setShowTable(v => !v)}
          className="text-sm text-accent hover:underline mb-3"
        >{showTable ? 'Hide the full table' : `Show the full table (${verbs.length})`}</button>

        {showTable && (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper">
                  <tr>
                    {['Infinitive', 'Past sg.', 'Past pl.', 'Participle', 'Aux.', 'English'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[11px] uppercase tracking-[.12em] text-ghost font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {verbs.map(v => (
                    <tr key={v.id} className="border-t border-border hover:bg-paper transition-colors">
                      <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{v.infinitive}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{v.past_singular}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{v.past_plural}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{v.participle}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                          v.auxiliary === 'zijn' ? 'border-accent text-accent'
                          : v.auxiliary === 'hebben' ? 'border-border text-muted'
                          : 'border-moss text-moss'
                        }`}>{v.auxiliary}</span>
                      </td>
                      <td className="px-3 py-2 text-ghost">{v.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loading && <p className="text-ghost text-sm mt-4">Loading…</p>}
      </div>
    </div>
  )
}
