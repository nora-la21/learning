import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameShell from '../components/GameShell'
import type { GameMode } from '../types'

const MODES: { id: GameMode; label: string; desc: string; icon: string; highlight?: boolean }[] = [
  { id: 'all_in_one', label: 'All in One', desc: 'All 4 modes in sequence — the full training cycle', icon: '⚡', highlight: true },
  { id: 'multiple_choice', label: 'Word → Translation', desc: 'See the Dutch word, pick the correct English translation', icon: '🃏' },
  { id: 'reverse_mc', label: 'Translation → Word', desc: 'See the English translation, pick the correct Dutch word', icon: '🔄' },
  { id: 'listening', label: 'Listening', desc: 'Hear the Dutch word, pick the correct English translation', icon: '👂' },
  { id: 'reverse_type_it', label: 'Type It', desc: 'See the English word, type the Dutch translation', icon: '✍️' },
]

const SESSION_SIZES: (number | null)[] = [5, 10, 20, 50, null]

export default function LearnPage() {
  const { listId } = useParams<{ listId: string }>()
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [sessionSize, setSessionSize] = useState<number | null>(10)
  const [skipMasteredModes, setSkipMasteredModes] = useState(false)
  const navigate = useNavigate()
  const id = Number(listId)

  // Parse optional ?words=1,2,3 param from URL (set by "Practice selected")
  const wordIds = (() => {
    const raw = new URLSearchParams(window.location.search).get('words')
    if (!raw) return undefined
    const ids = raw.split(',').map(Number).filter(Boolean)
    return ids.length > 0 ? ids : undefined
  })()

  if (selectedMode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-xl mx-auto px-4 py-10">
          <GameShell
            listId={id}
            mode={selectedMode}
            sessionSize={sessionSize}
            wordIds={wordIds}
            skipMasteredModes={skipMasteredModes}
            onBack={() => setSelectedMode(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-sm mb-6 block"
        >← My Vocabulary</button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Choose a practice mode</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-5 text-sm">
          Wrong answers repeat until you get them right ✓
        </p>

        {/* Session size picker */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-3 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Words per session:</span>
          <div className="flex gap-2 flex-wrap">
            {SESSION_SIZES.map(size => (
              <button
                key={size ?? 'all'}
                onClick={() => setSessionSize(size)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  sessionSize === size
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {size ?? 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Skip mastered modes toggle */}
        <label className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-5 cursor-pointer group">
          <input
            type="checkbox"
            checked={skipMasteredModes}
            onChange={e => setSkipMasteredModes(e.target.checked)}
            className="w-4 h-4 accent-violet-600 cursor-pointer shrink-0"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Skip mastered modes</span>
            <p className="text-xs text-gray-400 mt-0.5">In All-in-One, skip modes where a word is already mastered</p>
          </div>
        </label>

        <div className="space-y-3">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMode(m.id)}
              className={`w-full rounded-2xl border p-5 flex items-center gap-4 hover:shadow-md transition-all text-left group ${
                m.highlight
                  ? 'bg-violet-600 border-violet-600 text-white hover:bg-violet-700'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-400'
              }`}
            >
              <span className="text-3xl">{m.icon}</span>
              <div>
                <div className={`font-semibold ${m.highlight ? 'text-white' : 'text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors'}`}>
                  {m.label}
                </div>
                <div className={`text-sm ${m.highlight ? 'text-violet-200' : 'text-gray-500 dark:text-gray-400'}`}>
                  {m.desc}
                </div>
              </div>
              <span className={`ml-auto transition-colors ${m.highlight ? 'text-violet-300' : 'text-gray-300 dark:text-gray-600 group-hover:text-violet-400'}`}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
