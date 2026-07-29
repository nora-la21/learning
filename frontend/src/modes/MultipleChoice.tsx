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
          <span className="text-4xl font-bold text-ink">{question.prompt}</span>
          {showSourceSpeaker && (
            <button
              onClick={() => speak(question.prompt, question.prompt_lang)}
              className="text-ghost hover:text-accent transition-colors text-xl"
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
                p-4 rounded-[11px] text-left font-medium transition-all border text-sm md:text-base relative
                ${state === 'idle'     ? 'bg-surface border-border hover:border-accent text-ink' : ''}
                ${state === 'selected' ? 'bg-accent/10 border-accent text-ink' : ''}
                ${state === 'correct'  ? 'bg-green-100 border-moss text-green-900' : ''}
                ${state === 'wrong'    ? 'bg-red-100 border-red-500 text-red-900' : ''}
                ${state === 'almost'   ? 'bg-amber-100 border-amber-500 text-amber-900' : ''}
                ${state === 'dim'      ? 'bg-paper border-border text-ghost' : ''}
              `}
            >
              <span className={`absolute top-1.5 right-2 text-xs font-mono ${state === 'idle' ? 'opacity-25 text-ghost' : 'opacity-10'}`}>{i + 1}</span>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
