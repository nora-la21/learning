import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameShell from '../components/GameShell'
import NavMenu from '../components/NavMenu'
import type { GameMode } from '../types'

const MODES: { id: GameMode; label: string; desc: string; chip: string; highlight?: boolean }[] = [
  { id: 'all_in_one', label: 'All in One', desc: 'All 4 modes in sequence — the full training cycle', chip: '01–04', highlight: true },
  { id: 'multiple_choice', label: 'Word → Translation', desc: 'See the Dutch word, pick the correct English translation', chip: '01' },
  { id: 'reverse_mc', label: 'Translation → Word', desc: 'See the English translation, pick the correct Dutch word', chip: '02' },
  { id: 'listening', label: 'Listening', desc: 'Hear the Dutch word, pick the correct English translation', chip: '03' },
  { id: 'reverse_type_it', label: 'Type It', desc: 'See the English word, type the Dutch translation', chip: '04' },
]

const SESSION_SIZES: (number | null)[] = [5, 10, 20, 50, null]

export default function LearnPage() {
  const { listId } = useParams<{ listId: string }>()
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [sessionSize, setSessionSize] = useState<number | null>(10)
  const [skipMasteredModes, setSkipMasteredModes] = useState(false)
  const [knownOnType, setKnownOnType] = useState(
    () => localStorage.getItem('known-on-type-mastery') === 'true'
  )
  const navigate = useNavigate()
  const id = Number(listId)

  const params = new URLSearchParams(window.location.search)
  const wordIds = (() => {
    const raw = params.get('words')
    if (!raw) return undefined
    const ids = raw.split(',').map(Number).filter(Boolean)
    return ids.length > 0 ? ids : undefined
  })()
  // A review session keeps the server's most-overdue-first ordering.
  const isReview = params.get('review') === '1'

  if (selectedMode) {
    return (
      <div className="min-h-screen bg-paper transition-colors">
        <div className="max-w-xl mx-auto px-4 py-10">
          <GameShell
            listId={id}
            mode={selectedMode}
            sessionSize={sessionSize}
            wordIds={wordIds}
            skipMasteredModes={skipMasteredModes}
            review={isReview}
            onBack={() => setSelectedMode(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="text-ghost hover:text-ink transition text-sm mb-6 block"
        >← My Vocabulary</button>

        <p className="text-[11px] uppercase tracking-[.15em] text-ghost font-medium mb-1">Session</p>
        <h1 className="text-[30px] font-semibold text-ink mb-1">Choose a practice mode</h1>
        <p className="text-muted mb-5 text-sm">Wrong answers repeat until you get them right ✓</p>

        {/* Session size picker */}
        <div className="bg-surface rounded-2xl border border-border p-4 mb-3">
          <p className="text-[11px] uppercase tracking-[.14em] text-ghost font-medium mb-3">Words per session</p>
          <div className="flex gap-2 flex-wrap">
            {SESSION_SIZES.map(size => (
              <button
                key={size ?? 'all'}
                onClick={() => setSessionSize(size)}
                className={`px-3 py-1.5 rounded-[9px] text-sm font-semibold transition-colors border ${
                  sessionSize === size
                    ? 'bg-ink text-white border-ink'
                    : 'bg-surface border-border text-muted hover:border-muted'
                }`}
              >
                {size ?? 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Session options */}
        <div className="bg-surface rounded-2xl border border-border mb-5 divide-y divide-border">
          <label className="flex items-center gap-3 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={skipMasteredModes}
              onChange={e => setSkipMasteredModes(e.target.checked)}
              className="w-4 h-4 cursor-pointer shrink-0"
            />
            <div>
              <span className="text-sm font-medium text-ink">Skip mastered modes</span>
              <p className="text-xs text-ghost mt-0.5">In All-in-One, skip modes where a word is already mastered</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={knownOnType}
              onChange={e => {
                setKnownOnType(e.target.checked)
                localStorage.setItem('known-on-type-mastery', String(e.target.checked))
              }}
              className="w-4 h-4 cursor-pointer shrink-0"
            />
            <div>
              <span className="text-sm font-medium text-ink">Count as known once Type It is mastered</span>
              <p className="text-xs text-ghost mt-0.5">Typing a word from memory enough times marks it known, without finishing the other modes</p>
            </div>
          </label>
        </div>

        <div className="space-y-3">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMode(m.id)}
              className={`w-full rounded-[14px] border p-4 flex items-center gap-4 hover:shadow-md transition-all text-left group ${
                m.highlight
                  ? 'bg-ink border-ink'
                  : 'bg-surface border-border hover:border-muted'
              }`}
            >
              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded border shrink-0 border-accent text-accent">
                {m.chip}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${m.highlight ? 'text-white' : 'text-ink'}`}>
                  {m.label}
                </div>
                <div className={`text-sm ${m.highlight ? 'text-white/70' : 'text-muted'}`}>
                  {m.desc}
                </div>
              </div>
              <span className={`transition-colors ${m.highlight ? 'text-white/60' : 'text-ghost group-hover:text-accent'}`}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
