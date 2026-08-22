import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import NavMenu from '../components/NavMenu'
import { api } from '../api/client'
import type { DueSummary, HeatmapEntry, VerbSummary, WordList } from '../types'

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="p-4 text-center">
      <div className={`text-[26px] font-semibold ${tone ?? 'text-ink'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[.12em] text-ghost mt-0.5">{label}</div>
    </div>
  )
}

/** The last ~15 weeks of activity, newest column on the right. */
function Heatmap({ entries }: { entries: HeatmapEntry[] }) {
  const counts = new Map(entries.map(e => [e.date, e.count]))
  const days: { date: string; count: number }[] = []
  const today = new Date()
  for (let i = 104; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: counts.get(key) ?? 0 })
  }
  const max = Math.max(1, ...days.map(d => d.count))
  const shade = (n: number) =>
    n === 0 ? 'bg-track' : n / max > 0.66 ? 'bg-ink' : n / max > 0.33 ? 'bg-accent' : 'bg-moss'

  return (
    <div className="flex gap-[3px] flex-wrap">
      {days.map(d => (
        <div
          key={d.date}
          title={`${d.date} — ${d.count} answers`}
          className={`w-3 h-3 rounded-[3px] ${shade(d.count)}`}
        />
      ))}
    </div>
  )
}

export default function StatsPage() {
  const [lists, setLists] = useState<WordList[]>([])
  const [due, setDue] = useState<DueSummary | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([])
  const [verbs, setVerbs] = useState<VerbSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getLists(),
      api.getDue().catch(() => null),
      api.getHeatmap().catch(() => []),
      api.getVerbSummary().catch(() => null),
    ])
      .then(([l, d, h, v]) => { setLists(l); setDue(d); setHeatmap(h); setVerbs(v) })
      .finally(() => setLoading(false))
  }, [])

  const totalWords = lists.reduce((n, l) => n + (l.word_count || 0), 0)
  const mastered = lists.reduce((n, l) => n + (l.mastered_count || 0), 0)
  const seen = lists.reduce((n, l) => n + (l.seen_count || 0), 0)
  const answers30d = heatmap.reduce((n, e) => n + e.count, 0)
  const pct = totalWords ? Math.round((mastered / totalWords) * 100) : 0

  // Lists you have actually touched, best-known first — the useful ordering
  // here is "what am I close to finishing", not alphabetical.
  const active = lists
    .filter(l => (l.seen_count || 0) > 0)
    .sort((a, b) => (b.mastered_count || 0) - (a.mastered_count || 0))
    .slice(0, 12)

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">Overview</p>
        <h1 className="text-3xl font-bold text-ink mb-6">Progress &amp; statistics</h1>

        <div className="bg-surface rounded-2xl border border-border mb-4 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
          <Stat value={totalWords} label="Words available" />
          <Stat value={seen} label="Practised" />
          <Stat value={mastered} label="Mastered" tone="text-moss" />
          <Stat value={due?.total ?? 0} label="Due today" tone="text-accent" />
        </div>

        <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold text-ink">Vocabulary mastered</h2>
            <span className="text-sm text-muted font-mono">{pct}%</span>
          </div>
          <div className="h-2 bg-track rounded-full overflow-hidden">
            <div className="h-full bg-ink transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
          <h2 className="font-semibold text-ink mb-1">Activity</h2>
          <p className="text-sm text-muted mb-4">{answers30d} answers in the recorded period.</p>
          <Heatmap entries={heatmap} />
        </div>

        {verbs && (
          <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold text-ink">Irregular verbs</h2>
              <Link to="/verbs" className="text-sm text-accent hover:underline">Practise →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {verbs.modes.filter(m => m.mode !== 'meaning').map(m => (
                <div key={m.mode} className="rounded-xl border border-border p-3 text-center">
                  <div className="text-[20px] font-semibold text-ink">
                    {m.mastered}
                    <span className="text-ghost text-sm font-normal">/{verbs.total_verbs}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-[.12em] text-ghost mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {active.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <h2 className="font-semibold text-ink px-5 pt-5 pb-3">Lists in progress</h2>
            {active.map(l => {
              const p = l.word_count ? Math.round(((l.mastered_count || 0) / l.word_count) * 100) : 0
              return (
                <Link
                  key={l.id}
                  to={`/progress/${l.id}`}
                  className="flex items-center gap-4 px-5 py-3 border-t border-border hover:bg-paper transition-colors"
                >
                  <span className="flex-1 min-w-0 truncate text-ink text-sm">{l.name}</span>
                  <span className="w-24 h-1.5 bg-track rounded-full overflow-hidden shrink-0">
                    <span className="block h-full bg-ink" style={{ width: `${p}%` }} />
                  </span>
                  <span className="text-xs font-mono text-muted w-16 text-right shrink-0">
                    {l.mastered_count || 0}/{l.word_count}
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {loading && <p className="text-ghost text-sm mt-4">Loading…</p>}
      </div>
    </div>
  )
}
