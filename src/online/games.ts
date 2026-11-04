import { LISTING_HEARTBEAT_MS, type GameListing, type ListingRequest } from './gamesTypes';
import { apiRequest, leaderboardEnabled } from './leaderboard';

/** The open-games list needs the same Worker as the leaderboard. */
export const gamesListEnabled = leaderboardEnabled;

export async function fetchOpenGames(): Promise<GameListing[]> {
  return (await apiRequest<{ games: GameListing[] }>('/games')).games;
}

/**
 * Keeps a public room on the Worker's open-games list while it's waiting for players: posts a
 * heartbeat every LISTING_HEARTBEAT_MS, and removes the listing when stopped. Failures are
 * ignored (the room still works by Room ID).
 */
export class RoomListing {
  private secret: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private info: Omit<ListingRequest, 'secret'>;

  constructor(info: Omit<ListingRequest, 'secret'>) {
    this.info = info;
  }

  /** Start (or resume) advertising the room. */
  start(): void {
    if (!gamesListEnabled || this.timer) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), LISTING_HEARTBEAT_MS);
  }

  /** New player count / settings; sent right away if listed. */
  update(change: Partial<Omit<ListingRequest, 'secret' | 'code'>>): void {
    this.info = { ...this.info, ...change };
    if (this.timer) void this.beat();
  }

  /** Stop advertising and take the room off the list. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.secret) {
      void apiRequest(`/games/${this.info.code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${this.secret}` } }).catch(() => {});
    }
  }

  private async beat(): Promise<void> {
    try {
      const body: ListingRequest = { ...this.info, secret: this.secret };
      const res = await apiRequest<{ secret: string }>('/games', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      this.secret = res.secret;
    } catch {
      // Offline or rate-limited: players can still join with the Room ID.
    }
  }
}
