import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameShell from '../components/GameShell'
import type { GameMode } from '../types'

const MODES: { id: GameMode; label: string; desc: string; icon: string; highlight?: boolean }[] = [
  { id: 'all_in_one', label: 'All in One', desc: 'All 5 modes in sequence — the full training cycle', icon: '⚡', highlight: true },
  { id: 'multiple_choice', label: 'Word → Translation', desc: 'See the Dutch word, pick the correct English translation', icon: '🃏' },
  { id: 'reverse_mc', label: 'Translation → Word', desc: 'See the English translation, pick the correct Dutch word', icon: '🔄' },
  { id: 'listening', label: 'Listening', desc: 'Hear the Dutch word pronounced, pick what you heard', icon: '👂' },
  { id: 'type_it', label: 'Type It (Dutch → English)', desc: 'See the Dutch word, type the English translation', icon: '✍️' },
  { id: 'reverse_type_it', label: 'Type It (English → Dutch)', desc: 'See the English word, type the Dutch translation', icon: '🔤' },
]

export default function LearnPage() {
  const { listId } = useParams<{ listId: string }>()
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const navigate = useNavigate()
  const id = Number(listId)

  if (selectedMode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-xl mx-auto px-4 py-10">
          <GameShell
            listId={id}
            mode={selectedMode}
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

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Choose a practice mode</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Wrong answers repeat until you get them right ✓
        </p>

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
