/**
 * Leaderboard types and limits shared by the game client and the Worker (worker/src). Keep this
 * file free of browser/DOM imports — the Worker bundles it too.
 */

/** Modes that have leaderboards (ranked games only; see docs/ONLINE_PLAN.md). */
export const RANKED_MODES = ['solo', 'coop'] as const;
export type RankedMode = (typeof RANKED_MODES)[number];

export const LEADERBOARD_MODE_NAMES: Record<RankedMode, string> = { solo: 'Solo', coop: 'Co-op PvE' };

export type ScoreSort = 'wave' | 'elo';

/** `map` value for GET /scores that merges every map's board for the chosen mode. */
export const ALL_MAPS = 'all';

/** Each board (map + mode) keeps entries that are in its top BOARD_SIZE by wave or by ELO. */
export const BOARD_SIZE = 1000;
export const NAME_MAX_LENGTH = 20;
export const MAX_TEAM_SIZE = 10;
/** Most rows one GET /scores returns. */
export const MAX_PAGE_SIZE = 100;

export interface ScorePlayer {
  name: string;
  /** This player's peak ELO in the match. */
  elo: number;
}

export interface ScoreEntry {
  id: number;
  /** Map id the run was played on (useful when viewing all maps). */
  map: string;
  /** One player for solo, the whole team for co-op. */
  players: ScorePlayer[];
  wave: number;
  /** Solo: the player's peak ELO. Co-op: the team's average peak ELO (rounded). */
  elo: number;
  /** Submission time (ms since epoch), set by the server. */
  createdAt: number;
}

export interface ScoresPage {
  entries: ScoreEntry[];
  /** Entries on this board in total. */
  total: number;
}

export interface SubmitScoreRequest {
  players: ScorePlayer[];
  map: string;
  mode: RankedMode;
  wave: number;
  /** Game build that played the match. */
  version: string;
  /** configHash() of the match config; must match DEFAULT_CONFIG. */
  configHash: string;
}

export interface SubmitScoreResponse {
  id: number;
  /** 1-based rank on the board by wave / by ELO, or null if the entry didn't make the top BOARD_SIZE. */
  rankByWave: number | null;
  rankByElo: number | null;
}
