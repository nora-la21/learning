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
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
          Review {editableWords.length} word pairs
        </h3>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-32">
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">List name</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={listName}
              onChange={e => setListName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Learning</label>
            <select
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
            >
              {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Translation</label>
            <select
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
            >
              {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-750 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Word to learn</th>
                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Translation</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {editableWords.map((w, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-2 py-1">
                    <input
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-violet-400 focus:outline-none bg-transparent text-gray-900 dark:text-white"
                      value={w.source_word}
                      onChange={e => updateWord(i, 'source_word', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-violet-400 focus:outline-none bg-transparent text-gray-900 dark:text-white"
                      value={w.target_word}
                      onChange={e => updateWord(i, 'target_word', e.target.value)}
                    />
                  </td>
                  <td className="px-1">
                    <button
                      onClick={() => removeWord(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
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
          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >+ Add row</button>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => { setPreview(null); setEditableWords([]) }}
            className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={loading || !listName.trim() || editableWords.length < 4}
            className="flex-1 py-2 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
          ? 'border-violet-400 bg-violet-50 dark:bg-violet-950'
          : 'border-gray-300 dark:border-gray-600 hover:border-violet-400 hover:bg-gray-50 dark:hover:bg-gray-800'
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
        <p className="text-gray-600 dark:text-gray-400">Parsing file…</p>
      ) : (
        <>
          <p className="font-semibold text-gray-700 dark:text-gray-300">Drop your vocabulary file here</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">PDF, Word (.docx), CSV, or TXT</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Format: word, translation (one per line)</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </div>
  )
}
