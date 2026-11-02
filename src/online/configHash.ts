import type { GameConfig } from '../config/gameConfig';

/**
 * Stable fingerprint of a match config, shared by the game and the leaderboard Worker: ranked
 * scores must come from DEFAULT_CONFIG. The map and the saved-config version don't count (any
 * map can be ranked). Keys are sorted, so the hash doesn't depend on property order.
 */
export function configHash(cfg: GameConfig): string {
  const { map: _map, version: _version, ...rest } = cfg;
  return fnv1a(canonicalJson(rest));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 64-bit FNV-1a as 16 hex characters (two 32-bit halves with different offsets). */
function fnv1a(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
