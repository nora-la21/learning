import { useCallback, useRef, useState } from 'react'
import { api } from '../api/client'
import type { UploadPreview, WordPair } from '../types'

const LANG_OPTIONS = [
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
]

interface Props {
  onConfirmed: (listId: number) => void
}

export default function UploadZone({ onConfirmed }: Props) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [listName, setListName] = useState('')
  const [sourceLang, setSourceLang] = useState('nl')
  const [targetLang, setTargetLang] = useState('en')
  const [editableWords, setEditableWords] = useState<WordPair[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const prev = await api.uploadPreview(file)
      setPreview(prev)
      setEditableWords(prev.words)
      setListName(file.name.replace(/\.[^.]+$/, ''))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const confirm = async () => {
    if (!preview || !listName.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.uploadConfirm(
        listName.trim(), sourceLang, targetLang,
        editableWords.filter(w => w.source_word && w.target_word),
        preview.filename,
      )
      setPreview(null)
      setEditableWords([])
      onConfirmed(res.list_id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const removeWord = (i: number) => {
    setEditableWords(ws => ws.filter((_, idx) => idx !== i))
  }

  const updateWord = (i: number, field: 'source_word' | 'target_word', val: string) => {
    setEditableWords(ws => ws.map((w, idx) => idx === i ? { ...w, [field]: val } : w))
  }

  const addRow = () => {
    setEditableWords(ws => [...ws, { source_word: '', target_word: '' }])
  }

  if (preview) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
        <h3 className="font-semibold text-ink text-lg">
          Review {editableWords.length} word pairs
        </h3>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-32">
            <label className="text-[11px] uppercase tracking-[.12em] text-ghost mb-1 block">List name</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-ink text-sm focus:outline-none focus:border-ink transition-colors"
              value={listName}
              onChange={e => setListName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[.12em] text-ghost mb-1 block">Learning</label>
            <select
              className="px-3 py-2 rounded-lg border border-border bg-surface text-ink text-sm focus:outline-none focus:border-ink transition-colors"
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
            >
              {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[.12em] text-ghost mb-1 block">Translation</label>
            <select
              className="px-3 py-2 rounded-lg border border-border bg-surface text-ink text-sm focus:outline-none focus:border-ink transition-colors"
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
            >
              {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-paper sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[.12em] text-ghost font-medium">Word to learn</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[.12em] text-ghost font-medium">Translation</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {editableWords.map((w, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">
                    <input
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-border focus:border-ink focus:outline-none bg-transparent text-ink transition-colors"
                      value={w.source_word}
                      onChange={e => updateWord(i, 'source_word', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-border focus:border-ink focus:outline-none bg-transparent text-ink transition-colors"
                      value={w.target_word}
                      onChange={e => updateWord(i, 'target_word', e.target.value)}
                    />
                  </td>
                  <td className="px-1">
                    <button
                      onClick={() => removeWord(i)}
                      className="text-ghost hover:text-red-500 transition-colors p-1"
                      title="Remove"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addRow}
          className="text-sm text-accent hover:underline"
        >+ Add row</button>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => { setPreview(null); setEditableWords([]) }}
            className="flex-1 py-2 rounded-[9px] border border-border text-muted hover:bg-paper transition"
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={loading || !listName.trim() || editableWords.length < 4}
            className="flex-1 py-2 rounded-[9px] bg-ink text-onink font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Saving…' : `Save ${editableWords.length} words`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-accent bg-accent/5'
          : 'border-border hover:border-accent hover:bg-paper'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.csv,.txt"
        className="hidden"
        onChange={onFileInput}
      />
      <div className="text-4xl mb-3">📂</div>
      {loading ? (
        <p className="text-muted">Parsing file…</p>
      ) : (
        <>
          <p className="font-semibold text-ink">Drop your vocabulary file here</p>
          <p className="text-sm text-muted mt-1">PDF, Word (.docx), CSV, or TXT</p>
          <p className="text-xs text-ghost mt-2">Format: word, translation (one per line)</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </div>
  )
}
