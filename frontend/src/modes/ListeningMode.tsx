import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
}

export default function ListeningMode({ question, onAnswer }: Props) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const startTime = useRef(Date.now())
  const { speak } = useSpeech()

  useEffect(() => {
    setChosen(null)
    setRevealed(false)
    startTime.current = Date.now()
    // Auto-play on question load
    const t = setTimeout(() => speak(question.prompt, question.source_lang, 0.8), 300)
    return () => clearTimeout(t)
  }, [question.question_id])

  const replay = () => speak(question.prompt, question.source_lang, 0.8)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < (question.options?.length ?? 0)) {
        const opt = question.options![idx]
        const lang = question.option_langs?.[idx] ?? question.source_lang
        handleOption(opt, lang)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [question.question_id, chosen])

  const handleOption = (opt: string, lang: string) => {
    if (chosen) return
    speak(opt, lang)
    setChosen(opt)
    const timeMs = Date.now() - startTime.current
    setTimeout(() => {
      setRevealed(true)
      onAnswer(opt, timeMs)
    }, 1200)
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">What did you hear?</p>
        <button
          onClick={replay}
          className="w-24 h-24 rounded-full bg-violet-600 text-white text-4xl hover:bg-violet-700 active:scale-95 transition-all shadow-lg mx-auto flex items-center justify-center"
          title="Replay"
        >🔊</button>
        <p className="text-xs text-gray-400">Click to replay</p>
        {revealed && (
          <div className="text-xl font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-xl px-6 py-3 inline-block">
            {question.prompt}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {question.options?.map((opt, i) => {
          const lang = question.option_langs?.[i] ?? question.source_lang
          const state = chosen
            ? (opt === chosen ? (opt.toLowerCase() === question.prompt.toLowerCase() ? 'correct' : 'wrong') : 'dim')
            : 'idle'
          return (
            <button
              key={opt}
              onClick={() => handleOption(opt, lang)}
              disabled={!!chosen}
              className={`
                p-4 rounded-xl text-left font-medium transition-all border-2 text-sm md:text-base relative
                ${state === 'idle' ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950 text-gray-900 dark:text-white' : ''}
                ${state === 'correct' ? 'bg-green-50 dark:bg-green-950 border-green-500 text-green-800 dark:text-green-200' : ''}
                ${state === 'wrong' ? 'bg-red-50 dark:bg-red-950 border-red-500 text-red-800 dark:text-red-200' : ''}
                ${state === 'dim' ? 'bg-gray-50 dark:bg-gray-850 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500' : ''}
              `}
            >
              <span className={`absolute top-1.5 right-2 text-xs font-bold opacity-30 ${state !== 'idle' ? 'opacity-10' : ''}`}>{i + 1}</span>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
