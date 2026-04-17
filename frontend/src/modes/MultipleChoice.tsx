import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
  showSourceSpeaker?: boolean
}

export default function MultipleChoice({ question, onAnswer, showSourceSpeaker = true }: Props) {
  const [chosen, setChosen] = useState<string | null>(null)
  const startTime = useRef(Date.now())
  const { speak } = useSpeech()

  useEffect(() => {
    setChosen(null)
    startTime.current = Date.now()
    if (showSourceSpeaker) {
      speak(question.prompt, question.prompt_lang)
    }
  }, [question.question_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < (question.options?.length ?? 0)) {
        const opt = question.options![idx]
        const lang = question.option_langs?.[idx] ?? question.target_lang
        handleOption(opt, lang)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [question.question_id, chosen])

  const handleOption = (opt: string, lang: string) => {
    if (chosen) return
    // Only speak Dutch options, not English translations
    if (lang.startsWith(question.source_lang)) speak(opt, lang)
    setChosen(opt)
    setTimeout(() => {
      onAnswer(opt, Date.now() - startTime.current)
    }, 1200)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-gray-900 dark:text-white">{question.prompt}</span>
          {showSourceSpeaker && (
            <button
              onClick={() => speak(question.prompt, question.prompt_lang)}
              className="text-gray-400 hover:text-violet-500 transition-colors text-2xl"
              title="Hear pronunciation"
            >🔊</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Render in column-first order: 1=TL, 2=BL, 3=TR, 4=BR */}
        {[0, 2, 1, 3].map(i => {
          const opt = question.options?.[i]
          if (opt === undefined) return null
          const lang = question.option_langs?.[i] ?? question.target_lang
          const state = chosen
            ? (opt === chosen ? 'selected' : 'dim')
            : 'idle'
          return (
            <button
              key={opt}
              onClick={() => handleOption(opt, lang)}
              disabled={!!chosen}
              className={`
                p-4 rounded-xl text-left font-medium transition-all border-2 text-sm md:text-base relative
                ${state === 'idle' ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950 text-gray-900 dark:text-white' : ''}
                ${state === 'selected' ? 'bg-violet-100 dark:bg-violet-900 border-violet-400 text-violet-900 dark:text-violet-100' : ''}
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
