import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { DueSummary, RecentWord, Word, WordList } from '../types'
import UploadZone from '../components/UploadZone'
import ThemeToggle from '../components/ThemeToggle'
import { useSpeech } from '../hooks/useSpeech'

const FLAG: Record<string, string> = {
  nl: '🇳🇱', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪',
  es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
}

const LEVEL_LABELS: Record<string, string> = {
  'TaalComplete A1': 'TaalComplete A1',
  'TaalComplete A2': 'TaalComplete A2',
  A1: 'A1 — Beginner',
  A2: 'A2 — Elementary',
  B1: 'B1 — Intermediate',
  B2: 'B2 — Upper Intermediate',
}

function extractLevel(name: string): string {
  if (name.startsWith('📚 TaalComplete A1')) return 'TaalComplete A1'
  if (name.startsWith('📚 TaalComplete A2')) return 'TaalComplete A2'
  const m = name.match(/\b(A1|A2|B1|B2|C1|C2)\b/)
  return m ? m[1] : 'Other'
}

function extractThemeNumber(name: string): number[] {
  const m = name.match(/(\d+)\.(\d+)/)
  return m ? [parseInt(m[1]), parseInt(m[2])] : [999, 999]
}

function groupByLevel(lists: WordList[]): { level: string; lists: WordList[] }[] {
  const map = new Map<string, WordList[]>()
  for (const l of lists) {
    const lvl = extractLevel(l.name)
    if (!map.has(lvl)) map.set(lvl, [])
    map.get(lvl)!.push(l)
  }
  return Array.from(map.entries()).map(([level, lists]) => ({
    level,
    lists: lists.sort((a, b) => {
      const [aM, aN] = extractThemeNumber(a.name)
      const [bM, bN] = extractThemeNumber(b.name)
      return aM !== bM ? aM - bM : aN - bN
    }),
  }))
}

type Tab = 'builtin' | 'my'

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('builtin')
  const [builtinLists, setBuiltinLists] = useState<WordList[]>([])
  const [myLists, setMyLists] = useState<WordList[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState('')
  const [due, setDue] = useState<DueSummary | null>(null)
  const [recent, setRecent] = useState<RecentWord[]>([])
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const [b, m, d, r] = await Promise.all([
        api.getLists(true),
        api.getLists(false),
        api.getDue().catch(() => null),
        api.getRecentWords().catch(() => []),
      ])
      setBuiltinLists(b)
      setMyLists(m)
      setDue(d)
      setRecent(r)
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

  const handleImportDb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const password = localStorage.getItem('app_auth') ?? ''
    const form = new FormData()
    form.append('file', file)
    setImportMsg('Importing…')
    try {
      const res = await fetch(`/api/restore?key=${encodeURIComponent(password)}`, { method: 'POST', body: form })
      if (res.ok) {
        setImportMsg('Done! Reloading…')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        const detail = await res.json().then(d => d?.detail).catch(() => null)
        setImportMsg(detail || 'Import failed')
      }
    } catch {
      setImportMsg('Import failed')
    }
    e.target.value = ''
  }

  const lists = tab === 'builtin' ? builtinLists : myLists

  return (
    <div className="min-h-screen bg-paper transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[.15em] text-accent font-medium mb-1">Nederlands · vocabulary</p>
            <h1 className="text-3xl font-bold text-ink">My Vocabulary</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <label className="cursor-pointer px-3 py-2 border border-border text-muted rounded-lg text-xs font-medium hover:text-ink hover:border-ink transition" title="Import database">
              ⬆ Import DB
              <input type="file" accept=".db" className="hidden" onChange={handleImportDb} />
            </label>
            {importMsg && <span className="text-xs text-ghost">{importMsg}</span>}
            {tab === 'my' && (
              <button
                onClick={() => setShowUpload(v => !v)}
                className="px-4 py-2 bg-ink text-white rounded-[9px] text-sm font-medium hover:opacity-80 transition"
              >
                {showUpload ? '✕ Close' : '+ Upload words'}
              </button>
            )}
          </div>
        </div>

        {/* Due for review — the spaced-repetition schedule's daily prompt */}
        {due && due.total > 0 && (
          <div className="bg-ink rounded-2xl p-5 mb-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[.15em] text-white/50 font-medium mb-1">Due for review</p>
              <p className="text-white text-[22px] font-semibold leading-tight">
                {due.total} {due.total === 1 ? 'word' : 'words'} ready
              </p>
              <p className="text-white/60 text-xs mt-1 truncate">
                {due.by_list.slice(0, 2).map(l => `${l.name} (${l.count})`).join(' · ')}
                {due.by_list.length > 2 && ` · +${due.by_list.length - 2} more`}
              </p>
            </div>
            <button
              onClick={() => navigate(`/learn/${due.primary_list_id}?words=${due.word_ids.join(',')}&review=1`)}
              className="px-5 py-2.5 bg-white text-ink rounded-[9px] text-sm font-semibold hover:opacity-90 transition shrink-0"
            >Review now →</button>
          </div>
        )}

        {/* Recently saved — mostly words captured by the browser extension */}
        {recent.length > 0 && (
          <RecentlySaved
            words={recent}
            onPractice={ids => navigate(`/learn/${recent[0].list_id}?words=${ids.join(',')}`)}
            onDeleted={id => setRecent(ws => ws.filter(w => w.id !== id))}
          />
        )}

        {/* Voice picker */}
        <VoicePicker />

        {/* Tabs */}
        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setTab('builtin')}
            className={`px-4 py-2.5 text-sm font-medium -mb-px transition-colors ${
              tab === 'builtin'
                ? 'border-b-2 border-ink text-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            Built-in Lists
          </button>
          <button
            onClick={() => setTab('my')}
            className={`px-4 py-2.5 text-sm font-medium -mb-px transition-colors ${
              tab === 'my'
                ? 'border-b-2 border-ink text-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            My Lists {myLists.length > 0 && `(${myLists.length})`}
          </button>
        </div>

        {/* Upload zone */}
        {tab === 'my' && showUpload && (
          <div className="mb-6">
            <UploadZone onConfirmed={handleConfirmed} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-ghost">Loading…</div>
        ) : lists.length === 0 ? (
          <div className="text-center py-20 text-ghost">
            <div className="text-5xl mb-4">{tab === 'my' ? '📂' : '📚'}</div>
            {tab === 'my' ? (
              <>
                <p className="font-medium text-muted">No word lists yet</p>
                <p className="text-sm mt-1">Click "+ Upload words" to add your own vocabulary</p>
                <p className="text-xs mt-2 text-ghost">Supports CSV, TXT, PDF, and Word (.docx) files</p>
              </>
            ) : (
              <p className="font-medium text-muted">No built-in lists found</p>
            )}
          </div>
        ) : tab === 'builtin' ? (
          <div className="space-y-3">
            {groupByLevel(lists).map(({ level, lists: group }) => (
              <LevelGroup
                key={level}
                level={level}
                lists={group}
                defaultOpen={false}
                onPractice={id => { navigate(`/learn/${id}`) }}
                onPracticeSelected={(id, wordIds) => { navigate(`/learn/${id}?words=${wordIds.join(',')}`) }}
                onStats={id => { navigate(`/progress/${id}`) }}
                onPracticeSets={(listIds, excludeMastered) => {
                  void (async () => {
                    const wordArrays = await Promise.all(listIds.map(id => api.getWords(id, excludeMastered)))
                    const wordIds = wordArrays.flat().map(w => w.id)
                    navigate(`/learn/${listIds[0]}?words=${wordIds.join(',')}`)
                  })()
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {lists.map(list => (
              <ListCard
                key={list.id}
                list={list}
                flag={FLAG[list.source_lang] ?? '📖'}
                onPractice={() => { navigate(`/learn/${list.id}`) }}
                onPracticeSelected={(wordIds: number[]) => { navigate(`/learn/${list.id}?words=${wordIds.join(',')}`) }}
                onStats={() => { navigate(`/progress/${list.id}`) }}
                onDelete={() => deleteList(list.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Microsoft Edge Neural voices for Dutch
const NL_VOICES = [
  { name: 'nl-NL-ColetteNeural', label: 'Colette',   icon: '♀' },
  { name: 'nl-NL-MaartenNeural', label: 'Maarten',   icon: '♂' },
  { name: 'nl-BE-DenaNeural',    label: 'Dena (BE)', icon: '♀' },
  { name: 'nl-BE-ArnaudNeural',  label: 'Arnaud (BE)', icon: '♂' },
]

function RecentlySaved({
  words, onPractice, onDeleted,
}: {
  words: RecentWord[]
  onPractice: (ids: number[]) => void
  onDeleted: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const shown = open ? words : words.slice(0, 6)

  const remove = async (w: RecentWord) => {
    setBusy(w.id)
    try {
      await api.deleteWord(w.id)
      onDeleted(w.id)
    } finally {
      setBusy(null)
    }
  }

  const markKnown = async (w: RecentWord) => {
    setBusy(w.id)
    try {
      await api.setWordLearned(w.id, true)
      onDeleted(w.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[.15em] text-ghost font-medium">Saved this week</p>
          <p className="text-ink text-[15px] font-semibold mt-0.5">
            {words.length} {words.length === 1 ? 'word' : 'words'} captured
          </p>
        </div>
        {words.length >= 4 && (
          <button
            onClick={() => onPractice(words.map(w => w.id))}
            className="px-4 py-2 bg-ink text-white rounded-[9px] text-sm font-medium hover:opacity-80 transition shrink-0"
          >Practice these</button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shown.map(w => (
          <span
            key={w.id}
            className={`group inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg border border-border text-sm transition-opacity ${
              busy === w.id ? 'opacity-40' : ''
            }`}
            title={`${w.source_word} → ${w.target_word}  ·  ${w.list_name}`}
          >
            <span className="text-ink font-medium">{w.source_word}</span>
            <span className="text-ghost text-xs">{w.target_word}</span>
            <button
              onClick={() => markKnown(w)}
              disabled={busy === w.id}
              className="text-ghost hover:text-moss px-1 leading-none"
              title="Already know this — skip it in practice"
            >✓</button>
            <button
              onClick={() => remove(w)}
              disabled={busy === w.id}
              className="text-ghost hover:text-red-500 px-1 leading-none"
              title="Delete"
            >×</button>
          </span>
        ))}
      </div>

      {words.length > 6 && (
        <button
          onClick={() => setOpen(v => !v)}
          className="text-xs text-accent hover:underline mt-3"
        >{open ? 'Show less' : `Show all ${words.length}`}</button>
      )}
      {words.length < 4 && (
        <p className="text-xs text-ghost mt-3">Save at least 4 words to practise them together.</p>
      )}
    </div>
  )
}

function VoicePicker() {
  const [selected, setSelected] = useState(() => {
    const stored = localStorage.getItem('preferred_voice_nl') ?? ''
    if (stored && !stored.includes('Neural')) { localStorage.removeItem('preferred_voice_nl'); return '' }
    return stored
  })
  const { speak } = useSpeech()

  const pick = (name: string) => { setSelected(name); localStorage.setItem('preferred_voice_nl', name) }

  return (
    <div className="mb-6 p-4 bg-surface rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[.14em] text-ghost font-medium">Dutch voice</p>
        <button
          onClick={() => speak('Goedemorgen, hoe gaat het met je?', 'nl')}
          className="text-xs text-accent hover:underline transition"
        >
          Preview
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {NL_VOICES.map(v => (
          <button key={v.name} onClick={() => pick(v.name)} title={v.name}
            className={`px-3 py-1.5 text-sm rounded-lg border transition flex items-center gap-1.5 ${
              selected === v.name
                ? 'border-accent text-accent font-medium'
                : 'border-border text-muted hover:border-accent hover:text-accent'
            }`}>
            <span className="text-base leading-none">{v.icon}</span>{v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function LevelGroup({
  level, lists, defaultOpen, onPractice, onPracticeSelected, onStats, onPracticeSets,
}: {
  level: string
  lists: WordList[]
  defaultOpen: boolean
  onPractice: (id: number) => void
  onPracticeSelected: (id: number, wordIds: number[]) => void
  onStats: (id: number) => void
  onPracticeSets: (listIds: number[], excludeMastered: boolean) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedSets, setSelectedSets] = useState<Set<number>>(new Set())
  const [excludeMastered, setExcludeMastered] = useState(false)
  const totalWords = lists.reduce((s, l) => s + l.word_count, 0)
  const label = LEVEL_LABELS[level] ?? level

  const toggleSet = (id: number) => {
    setSelectedSets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-[18px] border border-border overflow-hidden" style={{ boxShadow: '0 18px 44px -30px rgba(60,45,30,.2)' }}>
      <div className="flex items-center gap-3 px-5 py-4 bg-surface">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-[18px] text-ink">{label}</span>
            <span className="ml-2 text-sm text-ghost">{lists.length} topics · {totalWords} words</span>
          </div>
          <span className={`text-accent transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {selectedSets.size > 0 && (
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none text-xs text-muted">
            <input
              type="checkbox"
              checked={excludeMastered}
              onChange={e => setExcludeMastered(e.target.checked)}
              className="w-3.5 h-3.5 cursor-pointer"
            />
            Skip mastered
          </label>
        )}
        {selectedSets.size > 0 && (
          <button
            onClick={() => { onPracticeSets(Array.from(selectedSets), excludeMastered); setSelectedSets(new Set()) }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-[9px] bg-ink text-white hover:opacity-80 transition font-medium"
          >▶ Practice {selectedSets.size} set{selectedSets.size > 1 ? 's' : ''}</button>
        )}
      </div>
      {open && (
        <div className="border-t border-border divide-y divide-border bg-paper">
          {lists.map(list => (
            <div key={list.id} className="flex items-center">
              <div className="pl-4 pr-1 py-3">
                <input
                  type="checkbox"
                  checked={selectedSets.has(list.id)}
                  onChange={() => toggleSet(list.id)}
                  className="w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="flex-1 min-w-0">
                <ListCard
                  list={list}
                  flag={FLAG[list.source_lang] ?? '📖'}
                  compact
                  onPractice={() => onPractice(list.id)}
                  onPracticeSelected={wordIds => onPracticeSelected(list.id, wordIds)}
                  onStats={() => onStats(list.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ListCard({
  list, flag, onPractice, onPracticeSelected, onStats, onDelete, compact = false,
}: {
  list: WordList
  flag: string
  onPractice: () => void
  onPracticeSelected: (wordIds: number[]) => void
  onStats: () => void
  onDelete?: () => void
  compact?: boolean
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
    const fresh = await api.getWords(list.id)
    setWords(fresh)
    setSelected(new Set())
  }

  const allSelected = !!words && words.length > 0 && selected.size === words.length
  const someSelected = selected.size > 0 && !allSelected

  const topic = compact
    ? list.name.replace(/^.*?—\s*/, '')
    : list.name

  const done = list.word_count > 0 && list.mastered_count >= list.word_count
  const masteredPct = list.word_count > 0 ? (list.mastered_count / list.word_count) : 0

  return (
    <div className={compact
      ? 'bg-surface hover:bg-paper transition-colors'
      : 'bg-surface rounded-[18px] border border-border shadow-sm hover:shadow-md transition-shadow'
    }>
      <div className={`flex items-center gap-4 ${compact ? 'px-5 py-3' : 'p-5'}`}>
        {!compact && <div className="text-3xl">{flag}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {done && <span className="text-lg shrink-0" title="All words mastered!">🏅</span>}
            <h3 className="font-semibold text-ink truncate">{topic}</h3>
          </div>
          <p className="text-sm text-muted">
            {list.word_count} words
            {!compact && ` · ${list.source_lang.toUpperCase()} → ${list.target_lang.toUpperCase()}`}
          </p>
        </div>
        <div className="flex gap-3 shrink-0 items-center">
          {/* Progress bar → clicks to stats */}
          {list.word_count > 0 && (
            <button
              onClick={onStats}
              title={`Mastered: ${list.mastered_count} · In progress: ${list.seen_count - list.mastered_count} · Not started: ${list.word_count - list.seen_count}`}
              className="flex flex-col items-end gap-0.5 group"
            >
              <div className="w-[90px] h-[5px] bg-track rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all group-hover:opacity-75"
                  style={{
                    width: `${Math.round(masteredPct * 100)}%`,
                    backgroundColor: masteredPct > 0.7 ? 'var(--color-moss)' : 'var(--color-accent)',
                  }}
                />
              </div>
              <p className="text-[10px] text-ghost group-hover:text-muted transition-colors">{list.mastered_count} mastered</p>
            </button>
          )}
          <button
            onClick={toggleBrowse}
            className="text-xs text-muted hover:text-ink transition-colors"
          >{expanded ? 'Hide' : 'Browse'}</button>
          <button
            onClick={onPractice}
            className="px-3.5 py-1.5 text-sm rounded-[9px] bg-ink text-white font-medium hover:opacity-80 transition"
          >Practice</button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-ghost hover:text-red-500 transition text-sm"
              title="Delete list"
            >🗑</button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {loadingWords ? (
            <p className="text-sm text-ghost text-center py-4">Loading…</p>
          ) : words && words.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-paper border-b border-border">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 cursor-pointer"
                  />
                  {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </label>
                {selected.size > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onPracticeSelected(Array.from(selected))}
                      className="text-xs px-3 py-1 rounded-[9px] bg-ink text-white hover:opacity-80 transition font-medium"
                    >
                      ▶ Practice ({selected.size})
                    </button>
                    <button
                      onClick={resetSelected}
                      className="text-xs px-3 py-1 rounded-[9px] bg-amber-100 text-amber-700 hover:bg-amber-200 transition font-medium"
                    >
                      Reset progress
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto px-5 py-2">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {words.map(w => (
                      <tr
                        key={w.id}
                        className={`group hover:bg-paper ${w.learned ? 'opacity-50' : ''}`}
                      >
                        <td className="py-1.5 pr-2 w-6">
                          <input
                            type="checkbox"
                            checked={selected.has(w.id)}
                            onChange={() => toggleSelect(w.id)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="py-1.5 pr-3 text-ink font-medium">
                          {w.source_word}
                        </td>
                        <td className="py-1.5 pr-2 text-muted flex-1">
                          {w.target_word}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => speak(w.source_word, list.source_lang)}
                            className="text-ghost hover:text-accent transition px-1 text-base"
                            title="Listen"
                          >🔊</button>
                          <button
                            onClick={() => toggleLearned(w.id, w.learned)}
                            className={`transition px-1 text-base ${
                              w.learned
                                ? 'text-moss hover:text-ghost'
                                : 'text-ghost hover:text-moss'
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
            <p className="text-sm text-ghost text-center py-4">No words yet</p>
          )}
        </div>
      )}
    </div>
  )
}