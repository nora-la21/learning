import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'
import type { AnswerFeedback } from '../components/GameShell'
import WordImage from '../components/WordImage'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
  feedback: AnswerFeedback
  showSourceSpeaker?: boolean
}

export default function MultipleChoice({ question, onAnswer, feedback, showSourceSpeaker = true }: Props) {
  const [chosen, setChosen] = useState<string | null>(null)
  const chosenRef = useRef<string | null>(null)
  const startTime = useRef(Date.now())
  const { speak } = useSpeech()

  useEffect(() => {
    chosenRef.current = null
    setChosen(null)
    startTime.current = Date.now()
    if (showSourceSpeaker) {
      speak(question.prompt, question.prompt_lang)
    }
  }, [question.question_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
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

  const handleOption = (opt: string, _lang: string) => {
    if (chosenRef.current) return
    chosenRef.current = opt
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
        {feedback && question.image_keyword && (
          <WordImage keyword={question.image_keyword} wordId={question.word_id} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => {
          const opt = question.options?.[i]
          if (opt === undefined) return null
          const lang = question.option_langs?.[i] ?? question.target_lang
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
