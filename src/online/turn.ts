import { apiRequest, leaderboardEnabled } from './leaderboard';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Don't hold up joining a room for longer than this while asking for relay credentials. */
const TURN_TIMEOUT_MS = 3000;
/** Credentials are valid for a day; fetch fresh ones at least hourly. */
const CACHE_MS = 60 * 60 * 1000;
let cached: { at: number; servers: IceServer[] } | undefined;

/**
 * Relay (TURN) servers from the Worker, used only when two players can't connect directly
 * (strict networks; two different browsers on one PC). Resolves to undefined when the Worker has
 * no TURN key configured, is unreachable, or is slow — the game then connects without a relay.
 */
export async function fetchTurnServers(): Promise<IceServer[] | undefined> {
  if (!leaderboardEnabled) return undefined;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.servers;
  try {
    const result = await Promise.race([
      apiRequest<{ iceServers: IceServer[] }>('/turn'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TURN_TIMEOUT_MS)),
    ]);
    cached = { at: Date.now(), servers: result.iceServers };
    return result.iceServers;
  } catch {
    return undefined;
  }
}
