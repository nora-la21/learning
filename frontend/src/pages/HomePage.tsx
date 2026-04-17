import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { WordList } from '../types'
import UploadZone from '../components/UploadZone'

const FLAG: Record<string, string> = {
  nl: '🇳🇱', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪',
  es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
}

export default function HomePage() {
  const [lists, setLists] = useState<WordList[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    try {
      setLists(await api.getLists())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deleteList = async (id: number) => {
    if (!confirm('Delete this word list?')) return
    await api.deleteList(id)
    setLists(ls => ls.filter(l => l.id !== id))
  }

  const handleConfirmed = (listId: number) => {
    setShowUpload(false)
    load()
    navigate(`/learn/${listId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Vocabulary</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Upload your words and start learning</p>
          </div>
          <button
            onClick={() => setShowUpload(v => !v)}
            className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition shadow-sm"
          >
            {showUpload ? '✕ Close' : '+ Upload words'}
          </button>
        </div>

        {showUpload && (
          <div className="mb-8">
            <UploadZone onConfirmed={handleConfirmed} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : lists.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📚</div>
            <p className="font-medium text-gray-600 dark:text-gray-300">No word lists yet</p>
            <p className="text-sm mt-1">Upload a CSV, PDF, or Word file to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lists.map(list => (
              <div
                key={list.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-3xl">
                  {FLAG[list.source_lang] ?? '📖'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{list.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {list.word_count} words · {list.source_lang.toUpperCase()} → {list.target_lang.toUpperCase()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/progress/${list.id}`)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >Stats</button>
                  <button
                    onClick={() => navigate(`/learn/${list.id}`)}
                    className="px-4 py-1.5 text-sm rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition"
                  >Practice</button>
                  <button
                    onClick={() => deleteList(list.id)}
                    className="px-2 py-1.5 text-sm rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                    title="Delete"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
