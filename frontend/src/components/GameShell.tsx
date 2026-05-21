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
  reverse_type_it: '✍️ Type It',
}

interface Props {
  listId: number
  mode: GameMode
  sessionSize?: number | null
  wordIds?: number[]
  skipMasteredModes?: boolean
  onBack: () => void
}

type FeedbackState = {
  show: boolean
  correct: boolean
  almost: boolean
  correctAnswer: string
}

export type AnswerFeedback = { correct: boolean; almost: boolean; correctAnswer: string } | null

export default function GameShell({ listId, mode, sessionSize = 10, wordIds, skipMasteredModes = false, onBack }: Props) {
  const effectiveSize = sessionSize ?? 9999
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
  const answeringRef = useRef(false)
  const [waitingForNext, setWaitingForNext] = useState(false)
  const pendingAdvance = useRef<(() => void) | null>(null)
  const navigate = useNavigate()
  const { speak, preload, cancel } = useSpeech()
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    startSession()
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
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
      const session = await api.startGame(listId, mode, effectiveSize, wordIds, skipMasteredModes)
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
      // Start fetching audio for every word that will be spoken this question
      preload(q.prompt, q.prompt_lang)   // use prompt_lang, not source_lang
      const optionLang = q.mode === 'reverse_mc' ? q.source_lang : q.target_lang
      q.options?.forEach(opt => preload(opt, optionLang))
    } catch {
      setFinished(true)
    }
  }

  const handleSkip = async () => {
    if (!sessionId || !question || answeringRef.current) return
    answeringRef.current = true
    setAnswering(true)
    try {
      // Permanently mark as known so it never appears again
      await api.setWordLearned(question.word_id, true)
      const result = await api.skipWord(sessionId, question.word_id)
      setProgress(result.progress_index)
      if (result.progress_index >= result.total) {
        setFinished(true)
        answeringRef.current = false
        setAnswering(false)
        return
      }
      if (result.mode_complete && result.new_mode) {
        setModeTransition(MODE_LABELS[result.new_mode] ?? result.new_mode)
        setTimeout(async () => {
          await loadNext(sessionId)
          setModeTransition(null)
          answeringRef.current = false
          setAnswering(false)
        }, 1800)
      } else {
        await loadNext(sessionId)
        answeringRef.current = false
        setAnswering(false)
      }
    } catch (e: any) {
      setError(e.message)
      answeringRef.current = false
      setAnswering(false)
    }
  }

  const handleAnswer = async (chosen: string, timeMs: number) => {
    if (!sessionId || !question || answeringRef.current) return
    answeringRef.current = true
    setAnswering(true)

    try {
      const result: GameAnswerResponse = await api.submitAnswer(
        sessionId, question.word_id, chosen, timeMs
      )
      setXp(x => x + result.xp_gained)
      setStreak(result.streak)
      setProgress(result.progress_index)

      if (question.mode === 'listening') {
        // Always speak the Dutch word after answering — reinforcement regardless of correct/wrong
        speak(question.prompt, question.source_lang)
      } else if (result.correct) {
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
        cancel()
        setWaitingForNext(false)
        pendingAdvance.current = null

        if (result.progress_index >= result.total) {
          setFeedback({ show: false, correct: false, almost: false, correctAnswer: '' })
          setFinished(true)
          answeringRef.current = false
          setAnswering(false)
          return
        }

        if (result.mode_complete && result.new_mode) {
          setModeTransition(MODE_LABELS[result.new_mode] ?? result.new_mode)
          setFeedback({ show: false, correct: false, almost: false, correctAnswer: '' })
          setTimeout(async () => {
            await loadNext(sessionId)
            setModeTransition(null)
            answeringRef.current = false
            setAnswering(false)
          }, 1800)
        } else {
          setFeedback({ show: false, correct: false, almost: false, correctAnswer: '' })
          await loadNext(sessionId)
          answeringRef.current = false
          setAnswering(false)
        }
      }

      pendingAdvance.current = advance
      setWaitingForNext(true)
    } catch (e: any) {
      setError(e.message)
      answeringRef.current = false
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
          {question.mode === 'reverse_type_it' && (
            <TypeItMode question={question} onAnswer={handleAnswer} feedback={feedback.show ? feedback : null} />
          )}
          {!feedback.show && !answering && (
            <button
              onClick={handleSkip}
              className="mt-3 w-full py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition"
            >
              ✓ I already know this word
            </button>
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
