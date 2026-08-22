export interface WordList {
  id: number
  name: string
  source_lang: string
  target_lang: string
  source_file: string | null
  builtin: number
  created_at: string
  word_count: number
  seen_count: number
  mastered_count: number
}

export interface Word {
  id: number
  list_id: number
  source_word: string
  target_word: string
  created_at: string
  learned: boolean
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
  all_modes: string[]
}

export interface GameQuestion {
  question_id: string
  word_id: number
  prompt: string
  prompt_lang: string
  options: string[] | null
  mode: string
  source_lang: string
  target_lang: string
  option_langs: string[] | null
  is_retry: boolean
  mode_index: number
  total_modes: number
  image_keyword?: string | null
}

export interface GameAnswerResponse {
  correct: boolean
  almost: boolean
  correct_answer: string
  xp_gained: number
  streak: number
  progress_index: number
  total: number
  mode_complete: boolean
  new_mode: string | null
  mode_index: number
  total_modes: number
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

export interface WordModeProgress {
  mode: string
  repetitions: number
  correct_count: number
  incorrect_count: number
  mastered: boolean
}

export interface WordProgressDetail {
  word_id: number
  source_word: string
  target_word: string
  modes: WordModeProgress[]
  total_correct: number
  total_incorrect: number
  fully_mastered: boolean
  learned: boolean
}

export interface HeatmapEntry {
  date: string
  count: number
}

export type GameMode =
  | 'multiple_choice'
  | 'reverse_mc'
  | 'listening'
  | 'reverse_type_it'
  | 'all_in_one'

export interface DueListEntry {
  list_id: number
  name: string
  count: number
}

export interface DueSummary {
  total: number
  word_ids: number[]
  primary_list_id: number | null
  by_list: DueListEntry[]
}

export interface RecentWord {
  id: number
  source_word: string
  target_word: string
  list_id: number
  list_name: string
  created_at: string
}

export interface MasteredWord {
  word_id: number
  source_word: string
  target_word: string
  list_id: number
  list_name: string
  marked_known: boolean
  mastered_modes: number
  total_correct: number
  total_incorrect: number
  last_seen_at: string | null
}

export interface MasteredWords {
  total: number
  words: MasteredWord[]
}

/** Which column of the conjugation table a question asks for. */
export type VerbMode =
  | 'past_singular'
  | 'past_plural'
  | 'participle'
  | 'auxiliary'
  | 'meaning'
  | 'all_forms'

export interface VerbModeProgress {
  mastered: boolean
  repetitions: number
}

export interface IrregularVerb {
  id: number
  infinitive: string
  past_singular: string
  past_plural: string
  participle: string
  auxiliary: string
  meaning: string
  progress: Partial<Record<VerbMode, VerbModeProgress>>
}

export interface VerbSummary {
  total_verbs: number
  due: number
  modes: { mode: VerbMode; label: string; practised: number; mastered: number }[]
}

export interface VerbStartResponse {
  session_id: string
  total: number
  modes: VerbMode[]
  verb_count: number
}

export interface VerbQuestion {
  verb_id: number
  mode: VerbMode
  mode_label: string
  infinitive: string
  meaning: string
  options: string[] | null
  progress_index: number
  total: number
  streak: number
}

export interface VerbRow {
  infinitive: string
  past_singular: string
  past_plural: string
  participle: string
  auxiliary: string
  meaning: string
}

export interface VerbAnswerResponse {
  correct: boolean
  expected: string
  streak: number
  progress_index: number
  total: number
  session_complete: boolean
  verb: VerbRow
}
