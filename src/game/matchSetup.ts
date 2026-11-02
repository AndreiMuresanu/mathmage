import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';

/** Game modes (see docs/ONLINE_PLAN.md). Co-op and FFA arrive with multiplayer. */
export type GameMode = 'solo' | 'coop' | 'ffa';

/** How a match was set up: chosen before it starts, kept for "Play again" and the leaderboard. */
export interface MatchSetup {
  mode: GameMode;
  /** Ranked matches always use DEFAULT_CONFIG (plus the map) so scores are comparable. */
  ranked: boolean;
  map: string;
}

export const MODE_NAMES: Record<GameMode, string> = {
  solo: 'Solo',
  coop: 'Co-op PvE',
  ffa: 'FFA PvP',
};

/** Mode names as they read after "Ranked" / "Custom". */
const MODE_IN_LABEL: Record<GameMode, string> = { solo: 'solo', coop: 'co-op PvE', ffa: 'FFA PvP' };

/** "Ranked solo", "Custom co-op PvE", ... */
export function setupLabel(setup: MatchSetup): string {
  return `${setup.ranked ? 'Ranked' : 'Custom'} ${MODE_IN_LABEL[setup.mode]}`;
}

/**
 * The config a match runs with: ranked games ignore the player's settings entirely and use the
 * defaults; custom games use the player's settings. Either way the map comes from the setup.
 */
export function matchConfig(setup: MatchSetup, customSettings: GameConfig): GameConfig {
  const cfg = cloneConfig(setup.ranked ? DEFAULT_CONFIG : customSettings);
  cfg.map = setup.map;
  return cfg;
}
