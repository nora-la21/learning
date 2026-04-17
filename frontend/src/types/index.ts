export interface WordList {
  id: number
  name: string
  source_lang: string
  target_lang: string
  source_file: string | null
  created_at: string
  word_count: number
}

export interface Word {
  id: number
  list_id: number
  source_word: string
  target_word: string
  created_at: string
}

export interface WordPair {
  source_word: string
  target_word: string
}

export interface UploadPreview {
  filename: string
  words: WordPair[]
  word_count: number
}

export interface UploadConfirmResponse {
  list_id: number
  word_count: number
}

export interface GameStartResponse {
  session_id: string
  total: number
  list_source_lang: string
  list_target_lang: string
}

export interface GameQuestion {
  question_id: string
  word_id: number
  prompt: string
  options: string[] | null
  mode: string
  source_lang: string
  target_lang: string
  option_langs: string[] | null
}

export interface GameAnswerResponse {
  correct: boolean
  correct_answer: string
  xp_gained: number
  streak: number
  progress_index: number
  total: number
}

export interface ProgressSummary {
  total_words: number
  mastered: number
  in_progress: number
  not_started: number
  due_today: number
  accuracy_7d: number | null
  current_streak: number
}

export interface WordProgressDetail {
  word_id: number
  source_word: string
  target_word: string
  repetitions: number
  ease_factor: number
  interval_days: number
  next_review_at: string
  mastered: boolean
  correct_count: number
  incorrect_count: number
}

export interface HeatmapEntry {
  date: string
  count: number
}

export type GameMode = 'multiple_choice' | 'reverse_mc' | 'listening' | 'type_it'
