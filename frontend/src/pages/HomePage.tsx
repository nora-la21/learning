import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Word, WordList } from '../types'
import UploadZone from '../components/UploadZone'
import { useSpeech } from '../hooks/useSpeech'

const FLAG: Record<string, string> = {
  nl: '🇳🇱', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪',
  es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
}

type Tab = 'builtin' | 'my'

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('builtin')
  const [builtinLists, setBuiltinLists] = useState<WordList[]>([])
  const [myLists, setMyLists] = useState<WordList[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const [b, m] = await Promise.all([
        api.getLists(true),
        api.getLists(false),
      ])
      setBuiltinLists(b)
      setMyLists(m)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deleteList = async (id: number) => {
    if (!confirm('Delete this word list?')) return
    await api.deleteList(id)
    setMyLists(ls => ls.filter(l => l.id !== id))
  }

  const handleConfirmed = (listId: number) => {
    setShowUpload(false)
    load()
    navigate(`/learn/${listId}`)
  }

  const lists = tab === 'builtin' ? builtinLists : myLists

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Vocabulary</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Learn Dutch with your own words</p>
          </div>
          {tab === 'my' && (
            <button
              onClick={() => setShowUpload(v => !v)}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition shadow-sm"
            >
              {showUpload ? '✕ Close' : '+ Upload words'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
          <button
            onClick={() => setTab('builtin')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'builtin'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            📚 Built-in Lists
          </button>
          <button
            onClick={() => setTab('my')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'my'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            📂 My Lists {myLists.length > 0 && `(${myLists.length})`}
          </button>
        </div>

        {/* Upload zone */}
        {tab === 'my' && showUpload && (
          <div className="mb-6">
            <UploadZone onConfirmed={handleConfirmed} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : lists.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">{tab === 'my' ? '📂' : '📚'}</div>
            {tab === 'my' ? (
              <>
                <p className="font-medium text-gray-600 dark:text-gray-300">No word lists yet</p>
                <p className="text-sm mt-1">Click "+ Upload words" to add your own vocabulary</p>
                <p className="text-xs mt-2 text-gray-400">Supports CSV, TXT, PDF, and Word (.docx) files</p>
              </>
            ) : (
              <p className="font-medium text-gray-600 dark:text-gray-300">No built-in lists found</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {lists.map(list => (
              <ListCard
                key={list.id}
                list={list}
                flag={FLAG[list.source_lang] ?? '📖'}
                onPractice={() => navigate(`/learn/${list.id}`)}
                onStats={() => navigate(`/progress/${list.id}`)}
                onDelete={list.builtin ? undefined : () => deleteList(list.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ListCard({
  list, flag, onPractice, onStats, onDelete,
}: {
  list: WordList
  flag: string
  onPractice: () => void
  onStats: () => void
  onDelete?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [words, setWords] = useState<Word[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const { speak } = useSpeech()

  const toggleBrowse = async () => {
    if (!expanded && words === null) {
      setLoadingWords(true)
      try {
        const w = await api.getWords(list.id)
        setWords(w)
      } finally {
        setLoadingWords(false)
      }
    }
    setExpanded(v => !v)
    setSelected(new Set())
  }

  const deleteWord = async (wordId: number) => {
    await api.deleteWord(wordId)
    setWords(ws => ws ? ws.filter(w => w.id !== wordId) : ws)
    setSelected(s => { const n = new Set(s); n.delete(wordId); return n })
  }

  const toggleLearned = async (wordId: number, current: boolean) => {
    await api.setWordLearned(wordId, !current)
    setWords(ws => ws ? ws.map(w => w.id === wordId ? { ...w, learned: !current } : w) : ws)
  }

  const toggleSelect = (wordId: number) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(wordId) ? n.delete(wordId) : n.add(wordId)
      return n
    })
  }

  const toggleSelectAll = () => {
    if (!words) return
    setSelected(selected.size === words.length ? new Set() : new Set(words.map(w => w.id)))
  }

  const resetSelected = async () => {
    if (selected.size === 0) return
    await api.resetProgress(Array.from(selected))
    // Refresh word learned status
    const fresh = await api.getWords(list.id)
    setWords(fresh)
    setSelected(new Set())
  }

  const allSelected = !!words && words.length > 0 && selected.size === words.length
  const someSelected = selected.size > 0 && !allSelected

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5 flex items-center gap-4">
        <div className="text-3xl">{flag}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{list.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {list.word_count} words · {list.source_lang.toUpperCase()} → {list.target_lang.toUpperCase()}
            {list.builtin ? ' · Built-in' : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={toggleBrowse}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              expanded
                ? 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >{expanded ? 'Hide' : 'Browse'}</button>
          <button
            onClick={onStats}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >Stats</button>
          <button
            onClick={onPractice}
            className="px-4 py-1.5 text-sm rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition"
          >Practice</button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-2 py-1.5 text-sm rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
              title="Delete list"
            >🗑</button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {loadingWords ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : words && words.length > 0 ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-5 py-2 bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-violet-600 cursor-pointer"
                  />
                  {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </label>
                {selected.size > 0 && (
                  <button
                    onClick={resetSelected}
                    className="text-xs px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 transition font-medium"
                  >
                    Reset progress ({selected.size})
                  </button>
                )}
              </div>
              {/* Word table */}
              <div className="max-h-80 overflow-y-auto px-5 py-2">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {words.map(w => (
                      <tr
                        key={w.id}
                        className={`group ${w.learned ? 'opacity-50' : ''}`}
                      >
                        <td className="py-1.5 pr-2 w-6">
                          <input
                            type="checkbox"
                            checked={selected.has(w.id)}
                            onChange={() => toggleSelect(w.id)}
                            className="w-4 h-4 accent-violet-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-1.5 pr-3 text-gray-800 dark:text-gray-200 font-medium">
                          {w.source_word}
                        </td>
                        <td className="py-1.5 pr-2 text-gray-500 dark:text-gray-400 flex-1">
                          {w.target_word}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => speak(w.source_word, list.source_lang)}
                            className="text-gray-400 hover:text-violet-500 transition px-1 text-base"
                            title="Listen"
                          >🔊</button>
                          <button
                            onClick={() => toggleLearned(w.id, w.learned)}
                            className={`transition px-1 text-base ${
                              w.learned
                                ? 'text-green-500 hover:text-gray-400'
                                : 'text-gray-300 dark:text-gray-600 hover:text-green-500'
                            }`}
                            title={w.learned ? 'Mark as not learned' : 'Mark as learned (skip in game)'}
                          >✓</button>
                          <button
                            onClick={() => deleteWord(w.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition px-1 text-xs"
                            title="Remove word"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No words yet</p>
          )}
        </div>
      )}
    </div>
  )
}
