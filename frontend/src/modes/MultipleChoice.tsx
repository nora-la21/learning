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
  const [correct, setCorrect] = useState<string | null>(null)
  const startTime = useRef(Date.now())
  const { speak } = useSpeech()

  useEffect(() => {
    setChosen(null)
    setCorrect(null)
    startTime.current = Date.now()
    // Auto-speak the prompt for MC (source word)
    if (showSourceSpeaker) {
      speak(question.prompt, question.source_lang)
    }
  }, [question.question_id])

  const handleOption = (opt: string, lang: string) => {
    if (chosen) return
    speak(opt, lang)
    setChosen(opt)
    const timeMs = Date.now() - startTime.current
    // small delay so user hears the TTS before card flips
    setTimeout(() => {
      onAnswer(opt, timeMs)
    }, 1200)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-gray-900 dark:text-white">{question.prompt}</span>
          {showSourceSpeaker && (
            <button
              onClick={() => speak(question.prompt, question.source_lang)}
              className="text-gray-400 hover:text-violet-500 transition-colors text-2xl"
              title="Hear pronunciation"
            >🔊</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {question.options?.map((opt, i) => {
          const lang = question.option_langs?.[i] ?? question.target_lang
          const state = chosen ? (opt === chosen ? (opt === correct ? 'correct' : 'wrong') : 'dim') : 'idle'
          return (
            <button
              key={opt}
              onClick={() => handleOption(opt, lang)}
              disabled={!!chosen}
              className={`
                p-4 rounded-xl text-left font-medium transition-all border-2 text-sm md:text-base
                ${state === 'idle' ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950 text-gray-900 dark:text-white' : ''}
                ${state === 'correct' ? 'bg-green-50 dark:bg-green-950 border-green-500 text-green-800 dark:text-green-200' : ''}
                ${state === 'wrong' ? 'bg-red-50 dark:bg-red-950 border-red-500 text-red-800 dark:text-red-200' : ''}
                ${state === 'dim' ? 'bg-gray-50 dark:bg-gray-850 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500' : ''}
              `}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
