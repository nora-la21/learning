import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { api } from '../api/client'
import type { HeatmapEntry, ProgressSummary, WordProgressDetail } from '../types'

const COLORS = { mastered: '#6E8A5E', in_progress: '#B5583C', not_started: '#EBE4D8' }

const ALL_MODES = ['multiple_choice', 'reverse_mc', 'listening', 'reverse_type_it']
const MODE_ICONS: Record<string, string> = {
  multiple_choice: '🃏',
  reverse_mc: '🔄',
  listening: '👂',
  reverse_type_it: '✍️',
}
const MODE_LABELS: Record<string, string> = {
  multiple_choice: 'Word → Translation',
  reverse_mc: 'Translation → Word',
  listening: 'Listening',
  reverse_type_it: 'Type It',
}

export default function ProgressPage() {
  const { listId } = useParams<{ listId: string }>()
  const id = Number(listId)
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [words, setWords] = useState<WordProgressDetail[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([])
  const [loading, setLoading] = useState(true)

  const toggleLearned = async (wordId: number, current: boolean) => {
    await api.setWordLearned(wordId, !current)
    setWords(ws => ws.map(w => w.word_id === wordId ? { ...w, learned: !current } : w))
  }

  useEffect(() => {
    Promise.all([
      api.getProgressSummary(id),
      api.getWordProgress(id),
      api.getHeatmap(),
    ]).then(([s, w, h]) => {
      setSummary(s)
      setWords(w)
      setHeatmap(h)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="text-ghost animate-pulse">Loading…</div>
    </div>
  )

  const pieData = summary ? [
    { name: 'Mastered', value: summary.mastered, color: COLORS.mastered },
    { name: 'In Progress', value: summary.in_progress, color: COLORS.in_progress },
    { name: 'Not Started', value: summary.not_started, color: COLORS.not_started },
  ].filter(d => d.value > 0) : []

  const masteryPct = summary && summary.total_words > 0
    ? Math.round((summary.mastered / summary.total_words) * 100)
    : 0

  const last7 = getLast7Days(heatmap)
  const maxCount = Math.max(...last7.map(d => d.count), 1)

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-border">
          <button
            onClick={() => navigate('/')}
            className="text-ghost hover:text-ink transition text-sm"
          >← Back</button>
          <h1 className="text-[28px] font-semibold text-ink">Progress</h1>
        </div>

        {/* Stat strip */}
        {summary && (
          <div className="bg-surface rounded-2xl border border-border mb-8 grid grid-cols-4 divide-x divide-border">
            <div className="p-4 text-center">
              <div className="text-[26px] font-semibold text-ink">{summary.total_words}</div>
              <div className="text-[10px] uppercase tracking-[.14em] text-ghost mt-0.5">Total Words</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[26px] font-semibold text-moss">{summary.mastered}</div>
              <div className="text-[10px] uppercase tracking-[.14em] text-ghost mt-0.5">Mastered</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[26px] font-semibold text-ink">{summary.accuracy_7d != null ? `${summary.accuracy_7d}%` : '—'}</div>
              <div className="text-[10px] uppercase tracking-[.14em] text-ghost mt-0.5">Accuracy (7d)</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[26px] font-semibold text-accent">{summary.current_streak}d</div>
              <div className="text-[10px] uppercase tracking-[.14em] text-ghost mt-0.5">Streak</div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Mastery donut */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h3 className="font-semibold text-ink mb-1">Mastery</h3>
            <p className="text-[11px] text-ghost uppercase tracking-[.12em] mb-4">A word is mastered when all 4 modes are done</p>
            {pieData.length > 0 ? (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-ink">{masteryPct}%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-3">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-xs text-muted">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="flex-1">{d.name}</span>
                      <span className="font-medium text-ink">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-ghost text-sm text-center py-8">No data yet — start practicing!</div>
            )}
          </div>

          {/* Activity chart */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h3 className="font-semibold text-ink mb-1">Activity</h3>
            <p className="text-[11px] text-ghost uppercase tracking-[.12em] mb-4">Last 7 days</p>
            {last7.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={last7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-ghost)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-ghost)' }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {last7.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.count === maxCount ? 'var(--color-ink)' : 'var(--color-accent)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-ghost text-sm text-center py-8">No activity yet</div>
            )}
          </div>
        </div>

        {/* Word table */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-ink">All Words</h3>
            <div className="flex gap-4 mt-2">
              {ALL_MODES.map(m => (
                <span key={m} className="text-[11px] uppercase tracking-[.12em] text-ghost flex items-center gap-1">
                  <span>{MODE_ICONS[m]}</span> {MODE_LABELS[m]}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[.12em] text-ghost font-medium">Word</th>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[.12em] text-ghost font-medium">Translation</th>
                  <th className="px-4 py-3 text-center text-[11px] uppercase tracking-[.12em] text-ghost font-medium">
                    {ALL_MODES.map(m => <span key={m} className="mx-1">{MODE_ICONS[m]}</span>)}
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] uppercase tracking-[.12em] text-ghost font-medium">✓</th>
                  <th className="px-4 py-3 text-center text-[11px] uppercase tracking-[.12em] text-ghost font-medium">✗</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {words.map(w => (
                  <tr key={w.word_id} className={`border-t border-border hover:bg-paper transition-colors ${w.learned ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-ink">{w.source_word}</td>
                    <td className="px-4 py-3 text-muted">{w.target_word}</td>
                    <td className="px-4 py-3">
                      <ModeBadges word={w} />
                    </td>
                    <td className="px-4 py-3 text-center text-moss font-medium">{w.total_correct || '—'}</td>
                    <td className="px-4 py-3 text-center text-red-500 font-medium">{w.total_incorrect || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleLearned(w.word_id, w.learned)}
                        className={`text-xs px-2 py-1 rounded-lg border transition whitespace-nowrap ${
                          w.learned
                            ? 'border-moss text-moss hover:bg-green-50'
                            : 'border-border text-ghost hover:border-moss hover:text-moss'
                        }`}
                        title={w.learned ? 'Mark as not learned' : 'Skip this word in games'}
                      >{w.learned ? '✓ Known' : 'Already know'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeBadges({ word }: { word: WordProgressDetail }) {
  if (word.modes.length === 0) {
    return <span className="text-xs text-ghost px-2">New</span>
  }
  return (
    <div className="flex justify-center gap-1.5">
      {ALL_MODES.map(mode => {
        const m = word.modes.find(mp => mp.mode === mode)
        if (!m) return (
          <span key={mode} className="text-base opacity-15" title={`${MODE_LABELS[mode]}: not started`}>
            {MODE_ICONS[mode]}
          </span>
        )
        if (m.mastered) return (
          <span key={mode} className="text-base" title={`${MODE_LABELS[mode]}: mastered ✓`}>
            {MODE_ICONS[mode]}
          </span>
        )
        return (
          <span key={mode} className="text-base opacity-40" title={`${MODE_LABELS[mode]}: ${m.repetitions} reps`}>
            {MODE_ICONS[mode]}
          </span>
        )
      })}
    </div>
  )
}

function getLast7Days(heatmap: HeatmapEntry[]) {
  const map = Object.fromEntries(heatmap.map(h => [h.date, h.count]))
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ day: d.toLocaleDateString('en', { weekday: 'short' }), count: map[key] ?? 0 })
  }
  return days
}
