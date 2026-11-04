import {
  LISTED_MODES,
  LISTING_TTL_MS,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type GameListing,
  type ListedMode,
} from '../../src/online/gamesTypes';
import { MAPS } from '../../src/sim/maps';
import { cleanName, HttpError, sha256, type Db } from './api';

/** New listings allowed per IP per hour (refreshing an existing one doesn't count). */
export const LISTINGS_PER_HOUR = 30;
const MAP_IDS = new Set(MAPS.map((m) => m.id));
const CODE = /^[A-Z0-9]{4,8}$/;

interface GameRow {
  code: string;
  secret_hash: string;
  host_name: string;
  mode: string;
  ranked: number;
  map: string;
  players: number;
  max_players: number;
  region: string;
  updated_at: number;
}

/** GET /games: rooms whose host checked in recently, newest first. */
export async function listGames(db: Db, now: number): Promise<{ games: GameListing[] }> {
  await db.prepare('DELETE FROM games WHERE updated_at < ?').bind(now - LISTING_TTL_MS).run();
  const { results } = await db.prepare('SELECT * FROM games ORDER BY updated_at DESC LIMIT 50').all<GameRow>();
  return {
    games: results.map((r) => ({
      code: r.code,
      hostName: r.host_name,
      mode: r.mode as ListedMode,
      ranked: !!r.ranked,
      map: r.map,
      players: r.players,
      maxPlayers: r.max_players,
      region: r.region,
      updatedAt: r.updated_at,
    })),
  };
}

/**
 * POST /games: create a listing (returns a new secret) or refresh one (needs that secret).
 * A code that another host is actively listing can't be taken over.
 */
export async function upsertGame(db: Db, body: unknown, ip: string, region: string, now: number): Promise<{ secret: string }> {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Body must be an object.');
  const b = body as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code : '';
  if (!CODE.test(code)) throw new HttpError(400, 'Invalid room code.');
  const hostName = cleanName(b.hostName);
  if (!hostName) throw new HttpError(400, 'Invalid host name.');
  if (typeof b.mode !== 'string' || !(LISTED_MODES as readonly string[]).includes(b.mode)) throw new HttpError(400, 'Unknown mode.');
  if (typeof b.map !== 'string' || !MAP_IDS.has(b.map)) throw new HttpError(400, 'Unknown map.');
  const maxPlayers = b.maxPlayers;
  if (!Number.isInteger(maxPlayers) || (maxPlayers as number) < MIN_ROOM_PLAYERS || (maxPlayers as number) > MAX_ROOM_PLAYERS) {
    throw new HttpError(400, 'Invalid max players.');
  }
  const players = b.players;
  if (!Number.isInteger(players) || (players as number) < 1 || (players as number) > (maxPlayers as number)) throw new HttpError(400, 'Invalid player count.');

  await db.prepare('DELETE FROM games WHERE updated_at < ?').bind(now - LISTING_TTL_MS).run();
  const existing = await db.prepare('SELECT secret_hash FROM games WHERE code = ?').bind(code).first<{ secret_hash: string }>();
  let secret = typeof b.secret === 'string' ? b.secret : '';
  if (existing) {
    if (!secret || (await sha256(secret)) !== existing.secret_hash) throw new HttpError(409, 'That room code is already listed.');
  } else {
    if (!secret) {
      // A brand-new listing: rate-limited per IP (heartbeats aren't).
      const ipKey = await sha256(`games:${ip}`);
      const recent = await db
        .prepare('SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > ?')
        .bind(ipKey, now - 60 * 60 * 1000)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= LISTINGS_PER_HOUR) throw new HttpError(429, 'Too many new games; try again later.');
      await db.prepare('INSERT INTO submissions (ip_hash, created_at) VALUES (?, ?)').bind(ipKey, now).run();
      secret = crypto.randomUUID();
    }
  }
  await db
    .prepare(
      `INSERT INTO games (code, secret_hash, host_name, mode, ranked, map, players, max_players, region, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET host_name = excluded.host_name, mode = excluded.mode, ranked = excluded.ranked,
         map = excluded.map, players = excluded.players, max_players = excluded.max_players, region = excluded.region,
         updated_at = excluded.updated_at`,
    )
    .bind(code, await sha256(secret), hostName, b.mode, b.ranked ? 1 : 0, b.map, players, maxPlayers, region.slice(0, 8), now)
    .run();
  return { secret };
}

/** DELETE /games/:code with `Authorization: Bearer <secret>`. */
export async function deleteGame(db: Db, code: string, authorization: string | null): Promise<{ deleted: string }> {
  const secret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const row = await db.prepare('SELECT secret_hash FROM games WHERE code = ?').bind(code).first<{ secret_hash: string }>();
  if (!row) return { deleted: code }; // already gone
  if (!secret || (await sha256(secret)) !== row.secret_hash) throw new HttpError(401, 'Not your room.');
  await db.prepare('DELETE FROM games WHERE code = ?').bind(code).run();
  return { deleted: code };
}
