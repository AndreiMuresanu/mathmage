import { DEFAULT_CONFIG } from '../../src/config/gameConfig';
import { configHash } from '../../src/online/configHash';
import {
  ALL_MAPS,
  BOARD_SIZE,
  MAX_PAGE_SIZE,
  MAX_TEAM_SIZE,
  NAME_MAX_LENGTH,
  RANKED_MODES,
  type RankedMode,
  type ScoreEntry,
  type ScorePlayer,
  type ScoreSort,
  type ScoresPage,
  type SubmitScoreResponse,
} from '../../src/online/leaderboardTypes';
import { MAPS } from '../../src/sim/maps';
import { deleteGame, listGames, upsertGame } from './games';
import { turnCredentials } from './turn';

/** The slice of Cloudflare D1's API this Worker uses (so tests can swap in plain SQLite). */
export interface Db {
  prepare(sql: string): Statement;
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { last_row_id: number } }>;
}

export interface Env {
  DB: Db;
  /** Secret for DELETE /scores/:id (set with `wrangler secret put ADMIN_KEY`). */
  ADMIN_KEY?: string;
  /** Value for Access-Control-Allow-Origin, e.g. the GitHub Pages origin. Defaults to '*'. */
  ALLOWED_ORIGIN?: string;
  /** Cloudflare TURN key (Realtime → TURN Server); both set with `wrangler secret put`. Optional. */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/** Submissions allowed per IP per hour. */
export const SUBMISSIONS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;
const MAX_WAVE = 100_000;
const MAX_ELO = 3000;
const MAX_VERSION_LENGTH = 32;

/** Ranked runs must use the default settings; computed once from the same source as the game. */
const DEFAULT_CONFIG_HASH = configHash(DEFAULT_CONFIG);
const MAP_IDS = new Set(MAPS.map((m) => m.id));

/** Row order for each sort: best first; ties go to whoever got there first. */
const ORDER: Record<ScoreSort, string> = {
  wave: 'wave DESC, elo DESC, created_at ASC, id ASC',
  elo: 'elo DESC, wave DESC, created_at ASC, id ASC',
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function handle(request: Request, env: Env, now = Date.now(), fetchFn: typeof fetch = fetch): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  try {
    if (url.pathname === '/scores' && request.method === 'GET') return json(await listScores(env.DB, url.searchParams));
    if (url.pathname === '/scores' && request.method === 'POST') {
      const body = await request.json().catch(() => {
        throw new HttpError(400, 'Body must be JSON.');
      });
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      return json(await submitScore(env.DB, body, ip, now), 201);
    }
    if (url.pathname === '/games' && request.method === 'GET') return json(await listGames(env.DB, now));
    if (url.pathname === '/turn' && request.method === 'GET') return json(await turnCredentials(env, fetchFn));
    if (url.pathname === '/games' && request.method === 'POST') {
      const body = await request.json().catch(() => {
        throw new HttpError(400, 'Body must be JSON.');
      });
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const region = (request as unknown as { cf?: { colo?: string } }).cf?.colo ?? '';
      return json(await upsertGame(env.DB, body, ip, region, now));
    }
    const game = url.pathname.match(/^\/games\/([A-Z0-9]{4,8})$/);
    if (game && request.method === 'DELETE') return json(await deleteGame(env.DB, game[1], request.headers.get('Authorization')));
    const del = url.pathname.match(/^\/scores\/(\d+)$/);
    if (del && request.method === 'DELETE') {
      if (!env.ADMIN_KEY || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_KEY}`) {
        throw new HttpError(401, 'Not authorised.');
      }
      await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(Number(del[1])).run();
      return json({ deleted: Number(del[1]) });
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error.' }, 500);
  }
}

// ------------------------------------------------------------------ GET /scores

/** GET /scores?map=<id or "all">&mode=...: one board, or every map's board for the mode merged. */
async function listScores(db: Db, params: URLSearchParams): Promise<ScoresPage> {
  const map = params.get('map') ?? '';
  const mode = params.get('mode') ?? '';
  const allMaps = map === ALL_MAPS;
  if (!allMaps && !MAP_IDS.has(map)) throw new HttpError(400, 'Unknown map.');
  if (!isRankedMode(mode)) throw new HttpError(400, 'Unknown mode.');
  const sort: ScoreSort = params.get('sort') === 'elo' ? 'elo' : 'wave';
  const limit = clampInt(params.get('limit'), 1, MAX_PAGE_SIZE, 50);
  // Each board holds at most 2 × BOARD_SIZE rows (top by wave ∪ top by ELO).
  const offset = clampInt(params.get('offset'), 0, BOARD_SIZE * 2 * (allMaps ? MAP_IDS.size : 1), 0);
  const [where, key] = allMaps ? ['mode = ?', mode] : ['board = ?', boardId(map, mode)];
  const { results } = await db
    .prepare(`SELECT id, map, names, wave, elo, created_at FROM scores WHERE ${where} ORDER BY ${ORDER[sort]} LIMIT ? OFFSET ?`)
    .bind(key, limit, offset)
    .all<{ id: number; map: string; names: string; wave: number; elo: number; created_at: number }>();
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE ${where}`).bind(key).first<{ n: number }>();
  const entries: ScoreEntry[] = results.map((r) => ({
    id: r.id,
    map: r.map,
    players: JSON.parse(r.names) as ScorePlayer[],
    wave: r.wave,
    elo: r.elo,
    createdAt: r.created_at,
  }));
  return { entries, total: count?.n ?? 0 };
}

// ------------------------------------------------------------------ POST /scores

/** A validated submission, ready to store. */
interface ValidScore {
  players: ScorePlayer[];
  map: string;
  mode: RankedMode;
  wave: number;
  elo: number;
  version: string;
}

async function submitScore(db: Db, body: unknown, ip: string, now: number): Promise<SubmitScoreResponse> {
  const score = validateSubmission(body);

  // Rate limit by (hashed) IP.
  const ipHash = await sha256(ip);
  await db.prepare('DELETE FROM submissions WHERE created_at < ?').bind(now - 24 * HOUR_MS).run();
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - HOUR_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= SUBMISSIONS_PER_HOUR) throw new HttpError(429, 'Too many submissions; try again later.');
  await db.prepare('INSERT INTO submissions (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now).run();

  const board = boardId(score.map, score.mode);
  const { meta } = await db
    .prepare('INSERT INTO scores (board, map, mode, names, wave, elo, players, created_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(board, score.map, score.mode, JSON.stringify(score.players), score.wave, score.elo, score.players.length, now, score.version)
    .run();
  const id = meta.last_row_id;

  // Keep only entries in the top BOARD_SIZE by wave or by ELO.
  await db
    .prepare(
      `DELETE FROM scores WHERE board = ?1
         AND id NOT IN (SELECT id FROM scores WHERE board = ?1 ORDER BY ${ORDER.wave} LIMIT ?2)
         AND id NOT IN (SELECT id FROM scores WHERE board = ?1 ORDER BY ${ORDER.elo} LIMIT ?2)`,
    )
    .bind(board, BOARD_SIZE)
    .run();

  return { id, rankByWave: await rankOf(db, board, id, 'wave'), rankByElo: await rankOf(db, board, id, 'elo') };
}

/** 1-based position of entry `id` on its board under `sort`, or null if it's not in the top BOARD_SIZE. */
async function rankOf(db: Db, board: string, id: number, sort: ScoreSort): Promise<number | null> {
  const row = await db
    .prepare(`SELECT pos FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY ${ORDER[sort]}) AS pos FROM scores WHERE board = ?) WHERE id = ?`)
    .bind(board, id)
    .first<{ pos: number }>();
  return row && row.pos <= BOARD_SIZE ? row.pos : null;
}

/** Check and normalise a POST /scores body; throws a 400 explaining the first problem. */
export function validateSubmission(body: unknown): ValidScore {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Body must be an object.');
  const b = body as Record<string, unknown>;
  if (typeof b.map !== 'string' || !MAP_IDS.has(b.map)) throw new HttpError(400, 'Unknown map.');
  if (typeof b.mode !== 'string' || !isRankedMode(b.mode)) throw new HttpError(400, 'Unknown mode.');
  if (b.configHash !== DEFAULT_CONFIG_HASH) throw new HttpError(400, 'Only ranked games (default settings) can be submitted.');
  if (!Number.isInteger(b.wave) || (b.wave as number) < 1 || (b.wave as number) > MAX_WAVE) throw new HttpError(400, 'Invalid wave.');
  if (typeof b.version !== 'string' || b.version.length > MAX_VERSION_LENGTH) throw new HttpError(400, 'Invalid version.');
  if (!Array.isArray(b.players)) throw new HttpError(400, 'Players must be a list.');
  const [minPlayers, maxPlayers] = b.mode === 'solo' ? [1, 1] : [2, MAX_TEAM_SIZE];
  if (b.players.length < minPlayers || b.players.length > maxPlayers) {
    throw new HttpError(400, b.mode === 'solo' ? 'Solo scores have exactly one player.' : `Co-op scores have 2–${MAX_TEAM_SIZE} players.`);
  }
  const players = b.players.map((p): ScorePlayer => {
    const name = p && typeof p === 'object' ? cleanName((p as Record<string, unknown>).name) : undefined;
    const elo = p && typeof p === 'object' ? (p as Record<string, unknown>).elo : undefined;
    if (!name) throw new HttpError(400, `Names must be 1–${NAME_MAX_LENGTH} characters.`);
    if (typeof elo !== 'number' || !Number.isFinite(elo) || elo < 0 || elo > MAX_ELO) throw new HttpError(400, 'Invalid ELO.');
    return { name, elo: Math.round(elo) };
  });
  const elo = Math.round(players.reduce((sum, p) => sum + p.elo, 0) / players.length);
  return { players, map: b.map, mode: b.mode, wave: b.wave as number, elo, version: b.version };
}

/** Trim, drop control/format characters, collapse spaces; undefined if empty or too long. */
export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX_LENGTH ? name : undefined;
}

// ------------------------------------------------------------------ helpers

function boardId(map: string, mode: RankedMode): string {
  return `${map}:${mode}`;
}

function isRankedMode(mode: string): mode is RankedMode {
  return (RANKED_MODES as readonly string[]).includes(mode);
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
