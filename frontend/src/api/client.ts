import type {
  WordList, Word, UploadPreview, UploadConfirmResponse,
  WordPair, GameStartResponse, GameQuestion, GameAnswerResponse,
  ProgressSummary, WordProgressDetail, HeatmapEntry, GameMode,
} from '../types'

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  getLists: (builtin?: boolean) => {
    const qs = builtin === true ? '?builtin=true' : builtin === false ? '?builtin=false' : ''
    return req<WordList[]>(`/lists${qs}`)
  },
  getWords: (listId: number) => req<Word[]>(`/lists/${listId}/words`),
  deleteList: (listId: number) => req<void>(`/lists/${listId}`, { method: 'DELETE' }),
  updateWord: (wordId: number, data: Partial<WordPair>) =>
    req<Word>(`/words/${wordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteWord: (wordId: number) => req<void>(`/words/${wordId}`, { method: 'DELETE' }),
  setWordLearned: (wordId: number, learned: boolean) =>
    req<void>(`/words/${wordId}/learned`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learned }),
    }),
  resetProgress: (wordIds: number[]) =>
    req<void>('/words/reset-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_ids: wordIds }),
    }),

  uploadPreview: (file: File): Promise<UploadPreview> => {
    const form = new FormData()
    form.append('file', file)
    return req<UploadPreview>('/upload', { method: 'POST', body: form })
  },
  uploadConfirm: (listName: string, sourceLang: string, targetLang: string, words: WordPair[], sourceFile?: string): Promise<UploadConfirmResponse> =>
    req<UploadConfirmResponse>('/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_name: listName, source_lang: sourceLang, target_lang: targetLang, words, source_file: sourceFile }),
    }),

  startGame: (listId: number, mode: GameMode, sessionSize = 20, wordIds?: number[]): Promise<GameStartResponse> =>
    req<GameStartResponse>('/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: listId, mode, session_size: sessionSize, word_ids: wordIds ?? null }),
    }),
  nextQuestion: (sessionId: string) => req<GameQuestion>(`/game/next?session_id=${sessionId}`),
  submitAnswer: (sessionId: string, wordId: number, chosen: string, timeMs: number): Promise<GameAnswerResponse> =>
    req<GameAnswerResponse>('/game/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, word_id: wordId, chosen, time_ms: timeMs }),
    }),
  skipWord: (sessionId: string, wordId: number) =>
    req<{ progress_index: number; total: number; mode_complete: boolean; new_mode: string | null }>
      (`/game/skip?session_id=${sessionId}&word_id=${wordId}`, { method: 'POST' }),

  getProgressSummary: (listId: number) => req<ProgressSummary>(`/progress/summary?list_id=${listId}`),
  getWordProgress: (listId: number) => req<WordProgressDetail[]>(`/progress/words?list_id=${listId}`),
  getHeatmap: () => req<HeatmapEntry[]>('/progress/heatmap'),
}
