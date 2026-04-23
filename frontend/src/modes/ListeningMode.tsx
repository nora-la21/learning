import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'
import type { AnswerFeedback } from '../components/GameShell'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
  feedback: AnswerFeedback
}

export default function ListeningMode({ question, onAnswer, feedback }: Props) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const startTime = useRef(Date.now())
  const { speak } = useSpeech()

  useEffect(() => {
    setChosen(null)
    setRevealed(false)
    startTime.current = Date.now()
    const t = setTimeout(() => speak(question.prompt, question.source_lang, 0.8), 300)
    return () => clearTimeout(t)
  }, [question.question_id])

  useEffect(() => {
    if (feedback) setRevealed(true)
  }, [feedback])

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

  const handleOption = (opt: string, _lang: string) => {
    if (chosen) return
    setChosen(opt)
    setTimeout(() => {
      onAnswer(opt, Date.now() - startTime.current)
    }, 150)
  }

  const getState = (opt: string) => {
    if (!chosen) return 'idle'
    if (!feedback) return opt === chosen ? 'selected' : 'dim'
    if (opt === chosen) {
      if (feedback.almost) return 'almost'
      return feedback.correct ? 'correct' : 'wrong'
    }
    if (!feedback.correct && opt === feedback.correctAnswer) return 'correct'
    return 'dim'
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">What does it mean?</p>
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
        {[0, 1, 2, 3].map(i => {
          const opt = question.options?.[i]
          if (opt === undefined) return null
          const lang = question.option_langs?.[i] ?? question.source_lang
          const state = getState(opt)
          return (
            <button
              key={opt}
              onClick={() => handleOption(opt, lang)}
              disabled={!!chosen}
              className={`
                p-4 rounded-xl text-left font-medium transition-all border-2 text-sm md:text-base relative
                ${state === 'idle'     ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950 text-gray-900 dark:text-white' : ''}
                ${state === 'selected' ? 'bg-violet-100 dark:bg-violet-900 border-violet-400 text-violet-900 dark:text-violet-100' : ''}
                ${state === 'correct'  ? 'bg-green-100 dark:bg-green-900 border-green-500 text-green-900 dark:text-green-100' : ''}
                ${state === 'wrong'    ? 'bg-red-100 dark:bg-red-900 border-red-500 text-red-900 dark:text-red-100' : ''}
                ${state === 'almost'   ? 'bg-amber-100 dark:bg-amber-900 border-amber-500 text-amber-900 dark:text-amber-100' : ''}
                ${state === 'dim'      ? 'bg-gray-50 dark:bg-gray-850 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500' : ''}
              `}
            >
              <span className={`absolute top-1.5 right-2 text-xs font-bold ${state === 'idle' ? 'opacity-30' : 'opacity-10'}`}>{i + 1}</span>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
