import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import NavMenu from '../components/NavMenu'
import { api } from '../api/client'
import { useSpeech } from '../hooks/useSpeech'
import type { Word, WordList, WordProgressDetail } from '../types'

type Filter = 'all' | 'unlearned' | 'mastered'
type Reveal = 'both' | 'source' | 'target'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unlearned', label: 'Still learning' },
  { id: 'mastered', label: 'Mastered' },
]

const REVEALS: { id: Reveal; label: string; hint: string }[] = [
  { id: 'both', label: 'Show both', hint: 'Read straight through' },
  { id: 'target', label: 'Hide English', hint: 'Cover the translation and test yourself' },
  { id: 'source', label: 'Hide Dutch', hint: 'Cover the Dutch and test yourself' },
]

/** Reading the list itself, without being pushed into a game to see it. */
export default function StudyPage() {
  const { listId } = useParams<{ listId: string }>()
  const id = Number(listId)
  const navigate = useNavigate()
  const { speak } = useSpeech()

  const [list, setList] = useState<WordList | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [progress, setProgress] = useState<Map<number, WordProgressDetail>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [reveal, setReveal] = useState<Reveal>('both')
  const [peeked, setPeeked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    if (!Number.isFinite(id)) { setError('Unknown list'); setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.getLists(),
      api.getWords(id),
      // Progress is a nice-to-have here; the list must still render without it.
      api.getWordProgress(id).catch(() => [] as WordProgressDetail[]),
    ])
      .then(([lists, w, p]) => {
        setList(lists.find(l => l.id === id) ?? null)
        setWords(w)
        setProgress(new Map(p.map(d => [d.word_id, d])))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const toggleKnown = async (word: Word) => {
    setBusy(word.id)
    try {
      await api.setWordLearned(word.id, !word.learned)
      setWords(ws => ws.map(w => w.id === word.id ? { ...w, learned: !w.learned } : w))
    } catch { /* leave the row as it was */ } finally { setBusy(null) }
  }

  const peek = (wordId: number) =>
    setPeeked(s => {
      const next = new Set(s)
      next.has(wordId) ? next.delete(wordId) : next.add(wordId)
      return next
    })

  const isMastered = (w: Word) => w.learned || Boolean(progress.get(w.id)?.fully_mastered)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return words.filter(w => {
      if (q && !w.source_word.toLowerCase().includes(q) &&
                !w.target_word.toLowerCase().includes(q)) return false
      if (filter === 'mastered') return isMastered(w)
      if (filter === 'unlearned') return !isMastered(w)
      return true
    })
  }, [words, query, filter, progress])

  const masteredCount = words.filter(isMastered).length

  if (loading) return (
    <div className="min-h-screen bg-paper">
      <NavMenu />
      <p className="text-ghost animate-pulse text-center py-20">Loading…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-paper">
      <NavMenu />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-red-500">{error}</p>
        <Link to="/" className="text-accent hover:underline text-sm">← My Vocabulary</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <NavMenu />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="text-ghost hover:text-ink transition text-sm mb-4 block"
        >← My Vocabulary</button>

        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">
              Study list
            </p>
            <h1 className="text-3xl font-bold text-ink break-words">{list?.name ?? 'Words'}</h1>
            <p className="text-muted text-sm mt-1">
              {words.length} words · {masteredCount} mastered
            </p>
          </div>
          <button
            onClick={() => navigate(`/learn/${id}`)}
            className="px-4 py-2 bg-ink text-onink rounded-[9px] text-sm font-medium hover:opacity-80 transition shrink-0"
          >Practise →</button>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 mb-4 space-y-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search this list…"
            className="w-full border border-border bg-paper text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink transition-colors"
          />
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-[9px] text-sm border transition-colors ${
                  filter === f.id ? 'bg-ink text-onink border-ink'
                                  : 'bg-surface border-border text-muted hover:border-muted'
                }`}
              >{f.label}</button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {REVEALS.map(r => (
              <button
                key={r.id}
                onClick={() => { setReveal(r.id); setPeeked(new Set()) }}
                title={r.hint}
                className={`px-3 py-1.5 rounded-[9px] text-sm border transition-colors ${
                  reveal === r.id ? 'bg-ink text-onink border-ink'
                                  : 'bg-surface border-border text-muted hover:border-muted'
                }`}
              >{r.label}</button>
            ))}
          </div>
          {reveal !== 'both' && (
            <p className="text-xs text-ghost">
              Tap a hidden word to reveal it — nothing here is recorded as an answer.
            </p>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            {words.length === 0 ? 'This list has no words yet.' : 'Nothing matches that.'}
          </p>
        ) : (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            {shown.map(w => {
              const mastered = isMastered(w)
              const open = peeked.has(w.id)
              const hidden = (side: 'source' | 'target') => reveal === side && !open
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-paper transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: mastered ? 'var(--color-moss)' : 'var(--color-track)' }}
                        title={mastered ? 'Mastered' : 'Still learning'} />

                  <button
                    onClick={() => hidden('source') && peek(w.id)}
                    className={`text-left font-medium min-w-0 flex-1 ${
                      hidden('source') ? 'text-ghost bg-track rounded px-2 select-none' : 'text-ink'}`}
                  >{hidden('source') ? '• • •' : w.source_word}</button>

                  <button
                    onClick={() => hidden('target') && peek(w.id)}
                    className={`text-left min-w-0 flex-1 ${
                      hidden('target') ? 'text-ghost bg-track rounded px-2 select-none' : 'text-muted'}`}
                  >{hidden('target') ? '• • •' : w.target_word}</button>

                  <button
                    onClick={() => speak(w.source_word, list?.source_lang ?? 'nl')}
                    className="text-ghost hover:text-accent transition px-1 shrink-0"
                    title="Listen"
                  >🔊</button>
                  <button
                    onClick={() => toggleKnown(w)}
                    disabled={busy === w.id}
                    className={`transition px-1 shrink-0 ${
                      w.learned ? 'text-moss hover:text-ghost' : 'text-ghost hover:text-moss'}`}
                    title={w.learned ? 'Marked as known — click to undo' : 'I already know this'}
                  >✓</button>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-ghost mt-4">
          Showing {shown.length} of {words.length}.
        </p>
      </div>
    </div>
  )
}
