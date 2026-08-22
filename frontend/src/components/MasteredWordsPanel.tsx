import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { MasteredWord } from '../types'

/** The words behind the "Mastered" count, grouped by the list they came from. */
export default function MasteredWordsPanel({ onClose }: { onClose: () => void }) {
  const [words, setWords] = useState<MasteredWord[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [openList, setOpenList] = useState<number | null>(null)

  useEffect(() => {
    api.getMasteredWords()
      .then(r => {
        setWords(r.words)
        // One list is the common case; open it rather than making them click again.
        const lists = new Set(r.words.map(w => w.list_id))
        if (lists.size === 1) setOpenList([...lists][0])
      })
      .catch(e => setError(e.message))
  }, [])

  const groups = useMemo(() => {
    if (!words) return []
    const q = query.trim().toLowerCase()
    const matching = q
      ? words.filter(w =>
          w.source_word.toLowerCase().includes(q) ||
          w.target_word.toLowerCase().includes(q))
      : words
    const byList = new Map<number, { name: string; words: MasteredWord[] }>()
    for (const w of matching) {
      if (!byList.has(w.list_id)) byList.set(w.list_id, { name: w.list_name, words: [] })
      byList.get(w.list_id)!.words.push(w)
    }
    return [...byList.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.words.length - a.words.length)
  }, [words, query])

  const shown = groups.reduce((n, g) => n + g.words.length, 0)
  const searching = query.trim().length > 0

  return (
    <div className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-ink">Mastered words</h2>
          <p className="text-sm text-muted">
            {words === null ? 'Loading…'
              : searching ? `${shown} of ${words.length} match “${query.trim()}”`
              : `${words.length} across ${groups.length} ${groups.length === 1 ? 'list' : 'lists'}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-ghost hover:text-ink transition-colors text-sm px-2 py-1"
          aria-label="Close mastered words"
        >✕</button>
      </div>

      {error && <p className="px-5 py-4 text-sm text-red-500">{error}</p>}

      {words !== null && words.length === 0 && !error && (
        <p className="px-5 py-6 text-sm text-muted">
          Nothing mastered yet. A word counts as mastered once you have got it
          right in all four modes, or once you tick “I already know this”.
        </p>
      )}

      {words !== null && words.length > 0 && (
        <>
          <div className="px-5 py-3 border-b border-border">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search mastered words…"
              className="w-full border border-border bg-paper text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink transition-colors"
            />
          </div>

          {groups.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted">No mastered word matches that.</p>
          )}

          <div className="max-h-[28rem] overflow-y-auto">
            {groups.map(g => {
              // A search has already narrowed things down, so keep every group
              // open rather than hiding the matches behind another click.
              const open = searching || openList === g.id
              return (
                <div key={g.id} className="border-b border-border last:border-0">
                  <button
                    onClick={() => setOpenList(open && !searching ? null : g.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-paper transition-colors text-left"
                    aria-expanded={open}
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-ink">{g.name}</span>
                    <span className="text-xs font-mono text-muted shrink-0">{g.words.length}</span>
                    <span className={`text-ghost text-xs shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                  </button>

                  {open && (
                    <div className="pb-2">
                      {g.words.map(w => (
                        <div
                          key={w.word_id}
                          className="flex items-baseline gap-3 px-5 py-1.5 text-sm"
                        >
                          <span className="text-ink font-medium">{w.source_word}</span>
                          <span className="text-ghost">—</span>
                          <span className="text-muted flex-1 min-w-0 truncate">{w.target_word}</span>
                          {w.marked_known ? (
                            <span
                              className="text-[10px] uppercase tracking-[.1em] text-ghost border border-border rounded px-1.5 py-0.5 shrink-0"
                              title="You marked this one as already known, rather than practising it"
                            >known</span>
                          ) : (
                            <span
                              className="text-[10px] font-mono text-moss shrink-0"
                              title={`${w.total_correct} correct, ${w.total_incorrect} wrong`}
                            >{w.total_correct}✓</span>
                          )}
                        </div>
                      ))}
                      <Link
                        to={`/progress/${g.id}`}
                        className="inline-block px-5 pt-2 text-xs text-accent hover:underline"
                      >Open this list’s progress →</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
