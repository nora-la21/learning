import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'
import type { AnswerFeedback } from '../components/GameShell'
import WordImage from '../components/WordImage'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
  feedback: AnswerFeedback
}

export default function TypeItMode({ question, onAnswer, feedback }: Props) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const startTime = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const { speak } = useSpeech()
  const isReverse = question.mode === 'reverse_type_it'

  useEffect(() => {
    setInput('')
    setSubmitted(false)
    startTime.current = Date.now()
    setTimeout(() => speak(question.prompt, question.prompt_lang, 0.85), 200)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [question.question_id])

  const submit = () => {
    if (!input.trim() || submitted) return
    setSubmitted(true)
    onAnswer(input.trim(), Date.now() - startTime.current)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[.14em] text-ghost font-medium mb-3">
          {isReverse ? 'Type in Dutch' : 'Type in English'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-ink">{question.prompt}</span>
          <button
            onClick={() => speak(question.prompt, question.prompt_lang)}
            className="text-ghost hover:text-accent transition-colors text-xl"
            title="Hear pronunciation"
          >🔊</button>
        </div>
        <p className="text-sm text-muted mt-2">
          {isReverse ? 'Type the Dutch word' : 'Type the English translation'}
        </p>
        {feedback && question.image_keyword && (
          <WordImage keyword={question.image_keyword} wordId={question.word_id} />
        )}
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          disabled={submitted}
          placeholder={isReverse ? 'Dutch word…' : 'English translation…'}
          className={`
            w-full px-5 py-4 rounded-xl text-lg border-2 focus:outline-none transition-colors
            ${submitted && !feedback ? 'opacity-60 cursor-not-allowed' : ''}
            bg-surface text-ink
            ${feedback?.correct  ? 'border-moss' :
              feedback?.almost   ? 'border-amber-500' :
              feedback && !feedback.correct ? 'border-red-500' :
              'border-border focus:border-ink'}
          `}
        />
        {/* The feedback colours are fixed, so white stays right on them; only
            the resting state sits on bg-ink, which inverts with the theme. */}
        <button
          onClick={submit}
          disabled={!input.trim() || submitted}
          className={`w-full py-3 rounded-[9px] font-semibold transition disabled:cursor-not-allowed
            ${feedback?.correct  ? 'bg-moss text-white' :
              feedback?.almost   ? 'bg-amber-500 text-white' :
              feedback           ? 'bg-red-500 text-white' :
              'bg-ink text-onink hover:opacity-80 disabled:opacity-50'}`}
        >
          {!submitted      ? 'Check ↵' :
           !feedback       ? 'Checking…' :
           feedback.correct ? '✓ Correct!' :
           feedback.almost  ? '~ Almost' :
                              '✗ Wrong'}
        </button>
        {feedback && !feedback.correct && (
          <div className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-center">
            <span className="text-[11px] text-red-400 uppercase tracking-[.12em] font-semibold">Correct answer</span>
            <p className="text-red-700 font-semibold mt-0.5">{feedback.correctAnswer}</p>
          </div>
        )}
      </div>
    </div>
  )
}
