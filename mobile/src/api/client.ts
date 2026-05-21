import { API_BASE } from './config';
import {
  WordList,
  Word,
  GameMode,
  GameQuestion,
  GameAnswerResponse,
  ProgressSummary,
  HeatmapEntry,
} from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function getLists(builtin?: boolean): Promise<WordList[]> {
  const query = builtin !== undefined ? `?builtin=${builtin}` : '';
  return request<WordList[]>(`/lists${query}`);
}

export async function getWords(listId: number): Promise<Word[]> {
  return request<Word[]>(`/lists/${listId}/words`);
}

export async function getProgressSummary(listId: number): Promise<ProgressSummary> {
  return request<ProgressSummary>(`/progress/summary?list_id=${listId}`);
}

export async function getHeatmap(): Promise<HeatmapEntry[]> {
  return request<HeatmapEntry[]>('/progress/heatmap');
}

export async function startGame(
  listId: number,
  mode: GameMode,
  sessionSize: number = 20,
  wordIds?: number[],
): Promise<{ session_id: string; total: number }> {
  return request<{ session_id: string; total: number }>('/game/start', {
    method: 'POST',
    body: JSON.stringify({
      list_id: listId,
      mode,
      session_size: sessionSize,
      word_ids: wordIds,
    }),
  });
}

export async function nextQuestion(sessionId: string): Promise<GameQuestion> {
  return request<GameQuestion>(`/game/next?session_id=${sessionId}`);
}

export async function submitAnswer(
  sessionId: string,
  wordId: number,
  chosen: string,
  timeMs: number,
): Promise<GameAnswerResponse> {
  return request<GameAnswerResponse>('/game/answer', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      word_id: wordId,
      chosen,
      time_ms: timeMs,
    }),
  });
}

export async function skipWord(sessionId: string, wordId: number): Promise<unknown> {
  return request<unknown>(
    `/game/skip?session_id=${sessionId}&word_id=${wordId}`,
    { method: 'POST' },
  );
}

export async function markLearned(wordId: number, learned: boolean): Promise<unknown> {
  return request<unknown>(`/words/${wordId}/learned`, {
    method: 'PATCH',
    body: JSON.stringify({ learned }),
  });
}
