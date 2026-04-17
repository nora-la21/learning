import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameShell from '../components/GameShell'
import type { GameMode } from '../types'

const MODES: { id: GameMode; label: string; desc: string; icon: string }[] = [
  { id: 'multiple_choice', label: 'Word → Translation', desc: 'See the word, pick the correct translation', icon: '🃏' },
  { id: 'reverse_mc', label: 'Translation → Word', desc: 'See the translation, pick the correct word', icon: '🔄' },
  { id: 'listening', label: 'Listening', desc: 'Hear the word pronounced, pick what you heard', icon: '👂' },
  { id: 'type_it', label: 'Type It', desc: 'See the word, type the translation yourself', icon: '✍️' },
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
        <p className="text-gray-500 dark:text-gray-400 mb-8">Each mode trains a different aspect of language retention</p>

        <div className="space-y-3">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMode(m.id)}
              className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 hover:border-violet-400 hover:shadow-md transition-all text-left group"
            >
              <span className="text-3xl">{m.icon}</span>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                  {m.label}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{m.desc}</div>
              </div>
              <span className="ml-auto text-gray-300 dark:text-gray-600 group-hover:text-violet-400 transition-colors">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
