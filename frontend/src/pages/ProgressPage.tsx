import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { api } from '../api/client'
import type { HeatmapEntry, ProgressSummary, WordProgressDetail } from '../types'

const COLORS = { mastered: '#22c55e', in_progress: '#a78bfa', not_started: '#e5e7eb' }

export default function ProgressPage() {
  const { listId } = useParams<{ listId: string }>()
  const id = Number(listId)
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [words, setWords] = useState<WordProgressDetail[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([])
  const [loading, setLoading] = useState(true)

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Loading…</div>
    </div>
  )

  const pieData = summary ? [
    { name: 'Mastered', value: summary.mastered, color: COLORS.mastered },
    { name: 'In Progress', value: summary.in_progress, color: COLORS.in_progress },
    { name: 'Not Started', value: summary.not_started, color: COLORS.not_started },
  ].filter(d => d.value > 0) : []

  // Last 7 days bar chart from heatmap
  const last7 = getLast7Days(heatmap)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-sm"
          >← Back</button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Progress</h1>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Words" value={summary.total_words} />
            <StatCard label="Mastered" value={summary.mastered} color="text-green-600 dark:text-green-400" />
            <StatCard label="Accuracy (7d)" value={summary.accuracy_7d != null ? `${summary.accuracy_7d}%` : '—'} />
            <StatCard label="Streak" value={`${summary.current_streak}d`} color="text-orange-500" />
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Pie chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Mastery</h3>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-sm text-center py-8">No data yet — start practicing!</div>
            )}
          </div>

          {/* Bar chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Activity (7 days)</h3>
            {last7.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={last7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-400 text-sm text-center py-8">No activity yet</div>
            )}
          </div>
        </div>

        {/* Word table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">All Words</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-750">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-400 font-medium">Word</th>
                  <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-400 font-medium">Translation</th>
                  <th className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 font-medium">Correct</th>
                  <th className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 font-medium">Wrong</th>
                </tr>
              </thead>
              <tbody>
                {words.map(w => (
                  <tr key={w.word_id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{w.source_word}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{w.target_word}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge word={w} />
                    </td>
                    <td className="px-4 py-3 text-center text-green-600 dark:text-green-400 font-medium">{w.correct_count}</td>
                    <td className="px-4 py-3 text-center text-red-500 dark:text-red-400 font-medium">{w.incorrect_count}</td>
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

function StatCard({ label, value, color = 'text-gray-900 dark:text-white' }: {
  label: string; value: string | number; color?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function StatusBadge({ word }: { word: WordProgressDetail }) {
  if (word.mastered)
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">Mastered</span>
  if (word.repetitions > 0)
    return <span className="px-2 py-0.5 rounded-full text-xs bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-medium">Learning</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">New</span>
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
