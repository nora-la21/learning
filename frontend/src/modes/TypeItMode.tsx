import { useEffect, useRef, useState } from 'react'
import type { GameQuestion } from '../types'
import { useSpeech } from '../hooks/useSpeech'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
}

export default function TypeItMode({ question, onAnswer }: Props) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const startTime = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const { speak } = useSpeech()

  useEffect(() => {
    setInput('')
    setSubmitted(false)
    startTime.current = Date.now()
    setTimeout(() => speak(question.prompt, question.source_lang, 0.85), 200)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [question.question_id])

  const submit = () => {
    if (!input.trim() || submitted) return
    const timeMs = Date.now() - startTime.current
    setSubmitted(true)
    onAnswer(input.trim(), timeMs)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-gray-900 dark:text-white">{question.prompt}</span>
          <button
            onClick={() => speak(question.prompt, question.source_lang)}
            className="text-gray-400 hover:text-violet-500 transition-colors text-2xl"
            title="Hear pronunciation"
          >🔊</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Type the translation</p>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={submitted}
          placeholder="Your answer…"
          className={`
            w-full px-5 py-4 rounded-xl text-lg border-2 focus:outline-none transition-colors
            ${submitted ? 'opacity-60 cursor-not-allowed' : ''}
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            border-gray-300 dark:border-gray-600 focus:border-violet-500
          `}
        />
        <button
          onClick={submit}
          disabled={!input.trim() || submitted}
          className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitted ? 'Checking…' : 'Check ↵'}
        </button>
      </div>
    </div>
  )
}
