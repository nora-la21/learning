import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { VerbMode, VerbQuestion, VerbAnswerResponse } from '../types'

interface Props {
  mode: VerbMode
  sessionSize: number
  onBack: () => void
}

export default function VerbGame({ mode, sessionSize, onBack }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<VerbQuestion | null>(null)
  const [feedback, setFeedback] = useState<VerbAnswerResponse | null>(null)
  const [typed, setTyped] = useState('')
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answering = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const startedAt = useRef(Date.now())

  useEffect(() => { start() }, [])

  async function start() {
    setError(null); setFinished(false); setDone(0); setCorrect(0); setStreak(0)
    try {
      const s = await api.startVerbGame(mode, sessionSize)
      setSessionId(s.session_id); setTotal(s.total)
      await loadNext(s.session_id)
    } catch (e: any) { setError(e.message) }
  }

  async function loadNext(sid: string) {
    setFeedback(null); setTyped(''); answering.current = false
    try {
      const q = await api.nextVerbQuestion(sid)
      setQuestion(q)
      startedAt.current = Date.now()
      setTimeout(() => input.current?.focus(), 60)
    } catch { setFinished(true) }
  }

  async function submit(value: string) {
    if (!sessionId || !question || answering.current || !value.trim()) return
    answering.current = true
    try {
      const r = await api.answerVerb(sessionId, question.verb_id, question.mode,
                                     value, Date.now() - startedAt.current)
      setFeedback(r)
      setDone(r.progress_index)
      setStreak(r.streak)
      if (r.correct) setCorrect(c => c + 1)
    } catch (e: any) {
      setError(e.message)
      answering.current = false
    }
  }

  function advance() {
    if (!sessionId) return
    if (feedback?.session_complete) { setFinished(true); return }
    loadNext(sessionId)
  }

  // Enter moves on once the answer has been marked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !feedback) return
      e.preventDefault()
      advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [feedback, sessionId])

  if (error) return (
    <div className="text-center py-16 space-y-4">
      <p className="text-red-500 font-medium">{error}</p>
      <button onClick={onBack} className="text-accent hover:underline">← Back</button>
    </div>
  )

  if (finished) {
    const pct = total ? Math.round((correct / total) * 100) : 0
    return (
      <div className="text-center py-14 space-y-5">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium">Session complete</p>
        <div className="text-5xl font-bold text-ink">{pct}%</div>
        <p className="text-muted">{correct} of {total} correct</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={start}
            className="px-5 py-2.5 bg-ink text-white rounded-[9px] text-sm font-semibold hover:opacity-80 transition">
            Practise again
          </button>
          <button onClick={onBack}
            className="px-5 py-2.5 border border-border text-muted rounded-[9px] text-sm hover:text-ink hover:border-ink transition">
            Back to verbs
          </button>
        </div>
      </div>
    )
  }

  if (!question) return <div className="text-ghost animate-pulse py-16 text-center">Loading…</div>

  const isChoice = Boolean(question.options)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="text-ghost hover:text-ink transition text-sm">
          ← Verbs
        </button>
        <span className="text-muted font-mono text-xs">
          {streak > 0 && `${streak} streak · `}{done}/{total}
        </span>
      </div>
      <div className="h-1 bg-track rounded-full mb-8 overflow-hidden">
        <div className="h-full bg-ink transition-all duration-300"
             style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <div className="text-center mb-8">
        <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-3">
          {question.mode_label}
        </p>
        <div className="text-4xl font-bold text-ink">{question.infinitive}</div>
        <p className="text-sm text-muted mt-2">{question.meaning}</p>
      </div>

      {isChoice ? (
        <div className="grid grid-cols-1 gap-3">
          {question.options!.map(opt => {
            const chosen = feedback && opt.toLowerCase() === (feedback.expected ?? '').toLowerCase()
            const wrong = feedback && !feedback.correct && !chosen
            return (
              <button
                key={opt}
                onClick={() => submit(opt)}
                disabled={Boolean(feedback)}
                className={`p-4 rounded-[11px] border font-medium transition-all ${
                  feedback
                    ? chosen ? 'bg-green-100 border-moss text-green-900'
                             : wrong ? 'bg-paper border-border text-ghost'
                                     : 'bg-paper border-border text-ghost'
                    : 'bg-surface border-border hover:border-ink text-ink'
                }`}
              >{opt}</button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={input}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !feedback) { e.preventDefault(); submit(typed) } }}
            disabled={Boolean(feedback)}
            placeholder="Type the form…"
            className={`w-full px-5 py-4 rounded-xl text-lg border-2 bg-surface text-ink focus:outline-none transition-colors ${
              feedback?.correct ? 'border-moss'
                : feedback ? 'border-red-500' : 'border-border focus:border-ink'
            }`}
          />
          {!feedback && (
            <button
              onClick={() => submit(typed)}
              disabled={!typed.trim()}
              className="w-full py-3 rounded-[9px] bg-ink text-white font-semibold hover:opacity-80 disabled:opacity-50 transition"
            >Check ↵</button>
          )}
        </div>
      )}

      {feedback && (
        <div className="mt-6">
          <p className={`text-center font-semibold mb-4 ${
            feedback.correct ? 'text-moss' : 'text-red-500'}`}>
            {feedback.correct ? '✓ Correct' : `✗ ${feedback.expected}`}
          </p>
          {/* The whole row, so a mistake teaches the pattern and not just the cell. */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden text-sm">
            {([
              ['Infinitive', feedback.verb.infinitive],
              ['Past — singular', feedback.verb.past_singular],
              ['Past — plural', feedback.verb.past_plural],
              ['Participle', feedback.verb.participle],
              ['Auxiliary', feedback.verb.auxiliary],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between px-4 py-2 border-b border-border last:border-0">
                <span className="text-[11px] uppercase tracking-[.12em] text-ghost self-center">{label}</span>
                <span className="text-ink font-medium">{value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={advance}
            className="w-full mt-4 py-3 rounded-[9px] bg-ink text-white font-semibold hover:opacity-80 transition"
          >Continue ↵</button>
        </div>
      )}
    </div>
  )
}
