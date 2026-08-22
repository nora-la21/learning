export type GameMode =
  | 'multiple_choice'
  | 'reverse_mc'
  | 'listening'
  | 'reverse_type_it'
  | 'all_in_one';

export interface WordList {
  id: number;
  name: string;
  source_lang: string;
  target_lang: string;
  word_count: number;
  mastered_count: number;
  seen_count: number;
  builtin: boolean;
}

export interface Word {
  id: number;
  source_word: string;
  target_word: string;
  learned: boolean;
}

export interface GameQuestion {
  question_id: string;
  word_id: number;
  prompt: string;
  prompt_lang: string;
  options: string[];
  mode: GameMode;
  source_lang: string;
  target_lang: string;
  option_langs: string[];
  is_retry: boolean;
  mode_index: number;
  total_modes: number;
}

export interface GameAnswerResponse {
  correct: boolean;
  almost: boolean;
  correct_answer: string;
  xp_gained: number;
  streak: number;
  progress_index: number;
  total: number;
  mode_complete: boolean;
  new_mode: GameMode | null;
}

export interface ProgressSummary {
  total: number;
  mastered: number;
  in_progress: number;
  not_started: number;
}

export interface HeatmapEntry {
  date: string;
  count: number;
}
