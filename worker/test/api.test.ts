import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../src/config/gameConfig';
import { configHash } from '../../src/online/configHash';
import type { ScoresPage, SubmitScoreResponse } from '../../src/online/leaderboardTypes';
import { cleanName, handle, SUBMISSIONS_PER_HOUR, type Db, type Env, type Statement } from '../src/api';

/** Plain SQLite behind D1's prepare/bind/all/first/run API, with the real migrations applied in order. */
function memoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  const statement = (sql: string, values: unknown[] = []): Statement => ({
    bind: (...v) => statement(sql, v),
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(values as never[])) as T[] }),
    first: async <T>() => (sqlite.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    run: async () => ({ meta: { last_row_id: Number(sqlite.prepare(sql).run(...(values as never[])).lastInsertRowid) } }),
  });
  return { prepare: (sql) => statement(sql) };
}

const BASE = 'https://api.test';
const HASH = configHash(DEFAULT_CONFIG);

function setup(adminKey = 'secret') {
  const env: Env = { DB: memoryDb(), ADMIN_KEY: adminKey };
  let ipCounter = 0;
  const submit = (body: Record<string, unknown>, ip = `10.0.0.${ipCounter++}`, now = Date.now()) =>
    handle(
      new Request(`${BASE}/scores`, { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }),
      env,
      now,
    );
  const solo = (name: string, wave: number, elo: number, extra: Record<string, unknown> = {}) => ({
    players: [{ name, elo }],
    map: 'mazy',
    mode: 'solo',
    wave,
    version: 'test',
    configHash: HASH,
    ...extra,
  });
  const list = async (query: string) => (await (await handle(new Request(`${BASE}/scores?${query}`), env)).json()) as ScoresPage;
  return { env, submit, solo, list };
}

describe('POST /scores validation', () => {
  it('accepts a ranked solo score and reports its ranks', async () => {
    const { submit, solo } = setup();
    const res = await submit(solo('Ada', 12, 1400));
    expect(res.status).toBe(201);
    expect((await res.json()) as SubmitScoreResponse).toMatchObject({ rankByWave: 1, rankByElo: 1 });
  });

  it.each([
    ['custom settings', { configHash: configHash({ ...cloneConfig(DEFAULT_CONFIG), player: { ...DEFAULT_CONFIG.player, maxHp: 999 } }) }],
    ['an unknown map', { map: 'atlantis' }],
    ['an unknown mode', { mode: 'ffa' }],
    ['a fractional wave', { wave: 2.5 }],
    ['wave 0', { wave: 0 }],
    ['two players in solo', { players: [{ name: 'A', elo: 1 }, { name: 'B', elo: 1 }] }],
    ['a blank name', { players: [{ name: '   ', elo: 100 }] }],
    ['a 21-character name', { players: [{ name: 'x'.repeat(21), elo: 100 }] }],
    ['an impossible ELO', { players: [{ name: 'A', elo: 99999 }] }],
  ])('rejects %s', async (_label, change) => {
    const { submit, solo } = setup();
    const res = await submit(solo('Ada', 5, 500, change));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
  });

  it('a different map still counts as default settings', async () => {
    const { submit, solo } = setup();
    const hashForBoxy = configHash({ ...cloneConfig(DEFAULT_CONFIG), map: 'boxy' });
    expect((await submit(solo('Ada', 5, 500, { map: 'boxy', configHash: hashForBoxy }))).status).toBe(201);
  });

  it('cleans names', () => {
    expect(cleanName('  Ada ​  Lovelace\n')).toBe('Ada Lovelace');
    expect(cleanName('ｗｉｄｅ')).toBe('wide'); // NFKC
    expect(cleanName('')).toBeUndefined();
    expect(cleanName(42)).toBeUndefined();
  });

  it('co-op entries are one row per team, ranked by the average ELO', async () => {
    const { submit, list } = setup();
    const team = { map: 'boxy', mode: 'coop', wave: 9, version: 'test', configHash: HASH };
    expect((await submit({ ...team, players: [{ name: 'Solo', elo: 500 }] })).status).toBe(400);
    expect((await submit({ ...team, players: [{ name: 'A', elo: 1000 }, { name: 'B', elo: 1501 }] })).status).toBe(201);
    const page = await list('map=boxy&mode=coop&sort=elo');
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ elo: 1251, wave: 9, players: [{ name: 'A', elo: 1000 }, { name: 'B', elo: 1501 }] });
  });
});

describe('GET /scores', () => {
  it('sorts by wave or by ELO, filters by board, and pages', async () => {
    const { submit, solo, list } = setup();
    await submit(solo('LowWaveHighElo', 3, 2000));
    await submit(solo('HighWaveLowElo', 20, 600));
    await submit(solo('Middle', 10, 1200));
    await submit(solo('OtherMap', 99, 2999, { map: 'boxy' }));
    const byWave = await list('map=mazy&mode=solo&sort=wave');
    expect(byWave.total).toBe(3);
    expect(byWave.entries.map((e) => e.players[0].name)).toEqual(['HighWaveLowElo', 'Middle', 'LowWaveHighElo']);
    const byElo = await list('map=mazy&mode=solo&sort=elo');
    expect(byElo.entries.map((e) => e.players[0].name)).toEqual(['LowWaveHighElo', 'Middle', 'HighWaveLowElo']);
    const page2 = await list('map=mazy&mode=solo&sort=wave&limit=2&offset=2');
    expect(page2.entries.map((e) => e.players[0].name)).toEqual(['LowWaveHighElo']);
    expect(byWave.entries[0].createdAt).toBeGreaterThan(0);
  });

  it('ties go to whoever submitted first', async () => {
    const { submit, solo, list } = setup();
    await submit(solo('First', 5, 500), 'a', 1000);
    await submit(solo('Second', 5, 500), 'b', 2000);
    expect((await list('map=mazy&mode=solo')).entries.map((e) => e.players[0].name)).toEqual(['First', 'Second']);
  });

  it('"all" merges every map for the mode, and says which map each run was on', async () => {
    const { submit, solo, list } = setup();
    await submit(solo('MazyRun', 10, 500));
    await submit(solo('BoxyRun', 20, 400, { map: 'boxy' }));
    await submit(solo('CoopRun', 99, 900, { mode: 'coop', players: [{ name: 'A', elo: 900 }, { name: 'B', elo: 900 }] }));
    const all = await list('map=all&mode=solo&sort=wave');
    expect(all.total).toBe(2);
    expect(all.entries.map((e) => [e.players[0].name, e.map])).toEqual([['BoxyRun', 'boxy'], ['MazyRun', 'mazy']]);
    expect((await list('map=all&mode=solo&sort=elo')).entries[0].players[0].name).toBe('MazyRun');
  });

  it('rejects unknown boards', async () => {
    const { env } = setup();
    expect((await handle(new Request(`${BASE}/scores?map=nope&mode=solo`), env)).status).toBe(400);
  });
});

describe('top 1000 per board', () => {
  it('keeps entries in the top 1000 by wave or by ELO, and drops the rest', async () => {
    const { submit, solo, list } = setup();
    // 1000 strong-wave / weak-ELO runs fill the wave board...
    for (let i = 0; i < 1000; i++) await submit(solo(`w${i}`, 100 + i, 10));
    // ...a high-ELO run with a low wave still makes the ELO board, so it's kept.
    const eloStar = (await (await submit(solo('EloStar', 1, 2500))).json()) as SubmitScoreResponse;
    expect(eloStar.rankByWave).toBeNull();
    expect(eloStar.rankByElo).toBe(1);
    // A run that's bottom on both boards is dropped straight away.
    const loser = (await (await submit(solo('Loser', 1, 0))).json()) as SubmitScoreResponse;
    expect(loser).toMatchObject({ rankByWave: null, rankByElo: null });
    const page = await list('map=mazy&mode=solo&sort=elo&limit=1');
    expect(page.total).toBe(1001);
    expect(page.entries[0].players[0].name).toBe('EloStar');
  }, 60_000);
});

describe('abuse protection', () => {
  it(`allows ${SUBMISSIONS_PER_HOUR} submissions per IP per hour`, async () => {
    const { submit, solo } = setup();
    const t = 1_000_000_000;
    for (let i = 0; i < SUBMISSIONS_PER_HOUR; i++) expect((await submit(solo('A', 1, 1), 'same', t + i)).status).toBe(201);
    expect((await submit(solo('A', 1, 1), 'same', t + 100)).status).toBe(429);
    expect((await submit(solo('A', 1, 1), 'other', t + 100)).status).toBe(201);
    expect((await submit(solo('A', 1, 1), 'same', t + 60 * 60 * 1000 + 1)).status).toBe(201); // an hour later
  });

  it('only the admin key can delete entries', async () => {
    const { env, submit, solo, list } = setup('hunter2');
    const { id } = (await (await submit(solo('Faker', 9999, 3000))).json()) as SubmitScoreResponse;
    const del = (key: string) => handle(new Request(`${BASE}/scores/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${key}` } }), env);
    expect((await del('wrong')).status).toBe(401);
    expect((await list('map=mazy&mode=solo')).total).toBe(1);
    expect((await del('hunter2')).status).toBe(200);
    expect((await list('map=mazy&mode=solo')).total).toBe(0);
  });

  it('answers CORS preflight requests', async () => {
    const { env } = setup();
    const res = await handle(new Request(`${BASE}/scores`, { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('open games list', () => {
  const listing = (extra: Record<string, unknown> = {}) => ({ code: 'ROOM42', hostName: 'Hana', mode: 'coop', ranked: true, map: 'mazy', players: 1, maxPlayers: 4, ...extra });
  function games() {
    const env: Env = { DB: memoryDb() };
    const post = (body: unknown, now: number, ip = '1.1.1.1') =>
      handle(new Request(`${BASE}/games`, { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env, now);
    const list = async (now: number) => ((await (await handle(new Request(`${BASE}/games`), env, now)).json()) as { games: { code: string; players: number; ranked: boolean }[] }).games;
    const del = (code: string, secret: string, now: number) =>
      handle(new Request(`${BASE}/games/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } }), env, now);
    return { post, list, del };
  }

  it('a host lists a room, refreshes it with its secret, and removes it', async () => {
    const { post, list, del } = games();
    const created = await post(listing(), 1000);
    expect(created.status).toBe(200);
    const { secret } = (await created.json()) as { secret: string };
    expect(secret).toBeTruthy();
    expect(await list(2000)).toMatchObject([{ code: 'ROOM42', players: 1, ranked: true }]);
    expect((await post(listing({ players: 3, secret }), 3000)).status).toBe(200);
    expect((await list(4000))[0].players).toBe(3);
    expect((await del('ROOM42', 'wrong', 5000)).status).toBe(401);
    expect((await del('ROOM42', secret, 5000)).status).toBe(200);
    expect(await list(6000)).toEqual([]);
  });

  it("nobody else can take over or refresh a listed code", async () => {
    const { post } = games();
    await post(listing(), 1000);
    expect((await post(listing({ hostName: 'Intruder' }), 2000, '2.2.2.2')).status).toBe(409);
    expect((await post(listing({ secret: 'guess' }), 2000, '2.2.2.2')).status).toBe(409);
  });

  it('listings vanish 45 s after the last heartbeat (and the code becomes free again)', async () => {
    const { post, list } = games();
    await post(listing(), 1000);
    expect(await list(45_000)).toHaveLength(1);
    expect(await list(46_001)).toHaveLength(0);
    expect((await post(listing({ hostName: 'Someone else' }), 47_000, '3.3.3.3')).status).toBe(200);
  });

  it.each([
    ['a bad code', { code: 'no' }],
    ['an unknown mode', { mode: 'solo' }],
    ['an unknown map', { map: 'atlantis' }],
    ['max players above 4', { maxPlayers: 5 }],
    ['more players than the max', { players: 3, maxPlayers: 2 }],
    ['a blank host name', { hostName: '  ' }],
  ])('rejects %s', async (_label, change) => {
    const { post } = games();
    expect((await post(listing(change), 1000)).status).toBe(400);
  });
});
