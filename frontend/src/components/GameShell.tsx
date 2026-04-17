import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { GameAnswerResponse, GameMode, GameQuestion } from '../types'
import MultipleChoice from '../modes/MultipleChoice'
import ReverseMultipleChoice from '../modes/ReverseMultipleChoice'
import ListeningMode from '../modes/ListeningMode'
import TypeItMode from '../modes/TypeItMode'
import { useSpeech } from '../hooks/useSpeech'

const MODE_LABELS: Record<GameMode, string> = {
  multiple_choice: '🃏 Word → Translation',
  reverse_mc: '🔄 Translation → Word',
  listening: '👂 Listening',
  type_it: '✍️ Type It',
}

interface Props {
  listId: number
  mode: GameMode
  onBack: () => void
}

type FeedbackState = {
  show: boolean
  correct: boolean
  correctAnswer: string
  almost?: boolean
}

export default function GameShell({ listId, mode, onBack }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<GameQuestion | null>(null)
  const [total, setTotal] = useState(0)
  const [progress, setProgress] = useState(0)
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState>({ show: false, correct: false, correctAnswer: '' })
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)
  const navigate = useNavigate()
  const { speak } = useSpeech()
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    startSession()
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current) }
  }, [])

  const startSession = async () => {
    setLoading(true)
    setError(null)
    try {
      const session = await api.startGame(listId, mode)
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

      const normalized = chosen.trim().toLowerCase()
      const correctNorm = result.correct_answer.trim().toLowerCase()
      const almost = !result.correct && Math.abs(normalized.length - correctNorm.length) <= 2 &&
        levenshtein(normalized, correctNorm) === 1

      if (result.correct) {
        speak(result.correct_answer,
          mode === 'multiple_choice' ? question.target_lang : question.source_lang)
      }

      setFeedback({
        show: true,
        correct: result.correct,
        correctAnswer: result.correct_answer,
        almost,
      })

      feedbackTimer.current = setTimeout(async () => {
        setFeedback({ show: false, correct: false, correctAnswer: '' })
        if (result.progress_index >= result.total) {
          setFinished(true)
        } else {
          await loadNext(sessionId)
        }
        setAnswering(false)
      }, 1500)
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
    <FinishScreen xp={xp} total={total} onBack={onBack} onReplay={startSession} onProgress={() => navigate(`/progress/${listId}`)} />
  )

  const progressPct = total > 0 ? (progress / total) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-sm">
          ← Back
        </button>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {MODE_LABELS[mode]}
        </span>
        <div className="flex items-center gap-3 text-sm font-medium">
          {streak >= 2 && (
            <span className="text-orange-500">🔥 {streak}</span>
          )}
          <span className="text-violet-600 dark:text-violet-400">⚡ {xp} XP</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right -mt-4">{progress} / {total}</p>

      {/* Feedback overlay */}
      {feedback.show && (
        <div className={`rounded-xl px-5 py-3 text-center font-semibold text-sm transition-all ${
          feedback.almost
            ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            : feedback.correct
            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {feedback.almost
            ? `Almost! It's "${feedback.correctAnswer}"`
            : feedback.correct
            ? `Correct! ✓`
            : `Incorrect — "${feedback.correctAnswer}"`}
        </div>
      )}

      {/* Question */}
      {question && !feedback.show && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          {mode === 'multiple_choice' && (
            <MultipleChoice question={question} onAnswer={handleAnswer} />
          )}
          {mode === 'reverse_mc' && (
            <ReverseMultipleChoice question={question} onAnswer={handleAnswer} />
          )}
          {mode === 'listening' && (
            <ListeningMode question={question} onAnswer={handleAnswer} />
          )}
          {mode === 'type_it' && (
            <TypeItMode question={question} onAnswer={handleAnswer} />
          )}
        </div>
      )}
    </div>
  )
}

function FinishScreen({
  xp, total, onBack, onReplay, onProgress
}: {
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
        <button
          onClick={onReplay}
          className="py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition"
        >Practice Again</button>
        <button
          onClick={onProgress}
          className="py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >View Progress</button>
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
        >← Back to lists</button>
      </div>
    </div>
  )
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}
