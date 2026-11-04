import { version } from '../../package.json';
import type { RankedMode, ScoreSort, ScoresPage, SubmitScoreRequest, SubmitScoreResponse } from './leaderboardTypes';

/** Game build sent with submitted scores. */
export const GAME_VERSION = version;

const BASE_URL = (import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/+$/, '');

/** False when no API URL is configured (e.g. local dev without the Worker): the UI shows "offline". */
export const leaderboardEnabled = BASE_URL !== '';

const NAME_KEY = 'mathmage.playerName';

export async function fetchScores(map: string, mode: RankedMode, sort: ScoreSort, offset = 0, limit = 50): Promise<ScoresPage> {
  const params = new URLSearchParams({ map, mode, sort, offset: String(offset), limit: String(limit) });
  return apiRequest<ScoresPage>(`/scores?${params}`);
}

export async function submitScore(score: SubmitScoreRequest): Promise<SubmitScoreResponse> {
  return apiRequest<SubmitScoreResponse>('/scores', { method: 'POST', body: JSON.stringify(score), headers: { 'Content-Type': 'application/json' } });
}

/** The name last used for a submission (pre-fills the name field). */
export function savedPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode etc.): just don't remember it.
  }
}

/** Call the online API Worker (leaderboard, open-games list); throws with a readable message. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!leaderboardEnabled) throw new Error('Online features are offline.');
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, init);
  } catch {
    throw new Error("Couldn't reach the leaderboard. Check your connection.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Leaderboard error (${res.status}).`);
  return body;
}
