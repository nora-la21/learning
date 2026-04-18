import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'
import type { AnswerFeedback } from '../components/GameShell'

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
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          {isReverse ? 'Type in Dutch' : 'Type in English'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-gray-900 dark:text-white">{question.prompt}</span>
          <button
            onClick={() => speak(question.prompt, question.prompt_lang)}
            className="text-gray-400 hover:text-violet-500 transition-colors text-2xl"
            title="Hear pronunciation"
          >🔊</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {isReverse ? 'Type the Dutch word' : 'Type the English translation'}
        </p>
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
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            ${feedback?.correct  ? 'border-green-500' :
              feedback?.almost   ? 'border-amber-500' :
              feedback && !feedback.correct ? 'border-red-500' :
              'border-gray-300 dark:border-gray-600 focus:border-violet-500'}
          `}
        />
        <button
          onClick={submit}
          disabled={!input.trim() || submitted}
          className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitted ? 'Checking…' : 'Check ↵'}
        </button>
        {feedback && !feedback.correct && (
          <div className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-center">
            <span className="text-xs text-red-400 uppercase tracking-wide font-semibold">Correct answer</span>
            <p className="text-red-700 dark:text-red-300 font-semibold mt-0.5">{feedback.correctAnswer}</p>
          </div>
        )}
      </div>
    </div>
  )
}
