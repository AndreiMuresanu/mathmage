/**
 * Open-games list types shared by the game client and the Worker (worker/src/games.ts). Keep this
 * file free of browser/DOM imports — the Worker bundles it too.
 */

/** Modes a hosted room can be listed with. */
export const LISTED_MODES = ['coop', 'ffa'] as const;
export type ListedMode = (typeof LISTED_MODES)[number];

/** Listings disappear this long after the host's last heartbeat. */
export const LISTING_TTL_MS = 45_000;
/** How often a host refreshes its listing. */
export const LISTING_HEARTBEAT_MS = 15_000;
export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 10;

export interface GameListing {
  code: string;
  hostName: string;
  mode: ListedMode;
  ranked: boolean;
  map: string;
  players: number;
  maxPlayers: number;
  /** Rough location of the host (Cloudflare data centre code, e.g. "YYZ"); '' if unknown. */
  region: string;
  updatedAt: number;
}

/** POST /games body: create a listing (no secret) or refresh it (with the secret from creating it). */
export interface ListingRequest {
  code: string;
  hostName: string;
  mode: ListedMode;
  ranked: boolean;
  map: string;
  players: number;
  maxPlayers: number;
  secret?: string;
}
