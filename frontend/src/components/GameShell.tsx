import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { GameAnswerResponse, GameMode, GameQuestion } from '../types'
import MultipleChoice from '../modes/MultipleChoice'
import ReverseMultipleChoice from '../modes/ReverseMultipleChoice'
import ListeningMode from '../modes/ListeningMode'
import TypeItMode from '../modes/TypeItMode'
import { useSpeech } from '../hooks/useSpeech'

const MODE_LABELS: Record<string, string> = {
  multiple_choice: '🃏 Word → Translation',
  reverse_mc: '🔄 Translation → Word',
  listening: '👂 Listening',
  type_it: '✍️ Type It (Dutch → EN)',
  reverse_type_it: '🔤 Type It (EN → Dutch)',
}

interface Props {
  listId: number
  mode: GameMode
  sessionSize?: number
  onBack: () => void
}

type FeedbackState = {
  show: boolean
  correct: boolean
  almost: boolean
  correctAnswer: string
}

export type AnswerFeedback = { correct: boolean; almost: boolean } | null

export default function GameShell({ listId, mode, sessionSize = 10, onBack }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<GameQuestion | null>(null)
  const [total, setTotal] = useState(0)
  const [progress, setProgress] = useState(0)
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState>({ show: false, correct: false, almost: false, correctAnswer: '' })
  const [modeTransition, setModeTransition] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)
  const [waitingForNext, setWaitingForNext] = useState(false)
  const pendingAdvance = useRef<(() => void) | null>(null)
  const navigate = useNavigate()
  const { speak } = useSpeech()
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    startSession()
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!waitingForNext) return
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      pendingAdvance.current?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [waitingForNext])

  const startSession = async () => {
    setLoading(true)
    setError(null)
    setFinished(false)
    setProgress(0)
    setXp(0)
    setStreak(0)
    try {
      const session = await api.startGame(listId, mode, sessionSize)
      setSessionId(session.session_id)
      setTotal(session.total)
      await loadNext(session.session_id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadNext = async (sid: string) => {
    try {
      const q = await api.nextQuestion(sid)
      setQuestion(q)
    } catch {
      setFinished(true)
    }
  }

  const handleAnswer = async (chosen: string, timeMs: number) => {
    if (!sessionId || !question || answering) return
    setAnswering(true)

    try {
      const result: GameAnswerResponse = await api.submitAnswer(
        sessionId, question.word_id, chosen, timeMs
      )
      setXp(x => x + result.xp_gained)
      setStreak(result.streak)
      setProgress(result.progress_index)

      if (result.correct) {
        // Always speak the Dutch (source) word — prompt if it's Dutch, else correct_answer
        const dutchWord = question.prompt_lang === question.source_lang
          ? question.prompt
          : result.correct_answer
        speak(dutchWord, question.source_lang)
      }

      setFeedback({
        show: true,
        correct: result.correct,
        almost: result.almost,
        correctAnswer: result.correct_answer,
      })

      const advance = async () => {
        setWaitingForNext(false)
        pendingAdvance.current = null
        setFeedback({ show: false, correct: false, almost: false, correctAnswer: '' })

        if (result.progress_index >= result.total) {
          setFinished(true)
          setAnswering(false)
          return
        }

        if (result.mode_complete && result.new_mode) {
          setModeTransition(MODE_LABELS[result.new_mode] ?? result.new_mode)
          setTimeout(async () => {
            setModeTransition(null)
            await loadNext(sessionId)
            setAnswering(false)
          }, 1800)
        } else {
          await loadNext(sessionId)
          setAnswering(false)
        }
      }

      pendingAdvance.current = advance
      setWaitingForNext(true)
    } catch (e: any) {
      setError(e.message)
      setAnswering(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-lg animate-pulse">Loading session…</div>
    </div>
  )

  if (error) return (
    <div className="text-center py-16 space-y-4">
      <p className="text-red-500 font-medium">{error}</p>
      <button onClick={onBack} className="text-violet-600 hover:underline">← Back</button>
    </div>
  )

  if (finished) return (
    <FinishScreen xp={xp} total={total} onBack={onBack} onReplay={startSession}
      onProgress={() => navigate(`/progress/${listId}`)} />
  )

  const progressPct = total > 0 ? (progress / total) * 100 : 0
  const currentModeLabel = question ? MODE_LABELS[question.mode] ?? question.mode : ''
  const isAllInOne = mode === 'all_in_one'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-sm">
          ← Back
        </button>
        <div className="flex items-center gap-3 text-sm font-medium">
          {streak >= 2 && <span className="text-orange-500">🔥 {streak}</span>}
          <span className="text-violet-600 dark:text-violet-400">⚡ {xp} XP</span>
        </div>
      </div>

      {/* Mode label */}
      {isAllInOne && question && (
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400">
            Phase {question.mode_index + 1}/{question.total_modes} — {currentModeLabel}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">
            {question?.is_retry ? '⟳ Repeating incorrect' : ''}
          </span>
          <span className="text-xs text-gray-400">{progress} / {total}</span>
        </div>
      </div>

      {/* Mode transition banner */}
      {modeTransition && (
        <div className="rounded-xl px-5 py-4 text-center bg-violet-600 text-white font-semibold animate-pulse">
          Next up: {modeTransition}
        </div>
      )}

      {/* Question card */}
      {question && !modeTransition && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm relative">
          {!isAllInOne && (
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4 text-center">
              {currentModeLabel}
            </p>
          )}
          {(question.mode === 'multiple_choice') && (
            <MultipleChoice question={question} onAnswer={handleAnswer} feedback={feedback.show ? feedback : null} />
          )}
          {question.mode === 'reverse_mc' && (
            <ReverseMultipleChoice question={question} onAnswer={handleAnswer} feedback={feedback.show ? feedback : null} />
          )}
          {question.mode === 'listening' && (
            <ListeningMode question={question} onAnswer={handleAnswer} feedback={feedback.show ? feedback : null} />
          )}
          {(question.mode === 'type_it' || question.mode === 'reverse_type_it') && (
            <TypeItMode question={question} onAnswer={handleAnswer} feedback={feedback.show ? feedback : null} />
          )}
          {waitingForNext && (
            <button
              onClick={() => pendingAdvance.current?.()}
              className="mt-4 w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Continue → <span className="opacity-40 text-xs ml-1">Enter</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FinishScreen({ xp, total, onBack, onReplay, onProgress }: {
  xp: number, total: number, onBack: () => void,
  onReplay: () => void, onProgress: () => void
}) {
  return (
    <div className="text-center space-y-6 py-8">
      <div className="text-6xl">🎉</div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Session Complete!</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{total} words · {xp} XP earned</p>
      </div>
      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        <button onClick={onReplay}
          className="py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition">
          Practice Again
        </button>
        <button onClick={onProgress}
          className="py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          View Progress
        </button>
        <button onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          ← Back to lists
        </button>
      </div>
    </div>
  )
}
