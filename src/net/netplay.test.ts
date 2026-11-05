import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import { ClientDriver, HostDriver } from '../game/drivers';
import type { MatchSetup } from '../game/matchSetup';
import type { EnemyState, PlayerIntent, SimEvent } from '../sim/types';
import { World } from '../sim/world';
import { applySnapshot, CH, encodeSnapshot, PROTOCOL_VERSION, type RefuseMsg, type StartMsg, type SubmittedMsg } from './protocol';
import { RoomSession } from './room';
import { MemoryHub } from './transport';

const DT = 1 / 60;
const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };
const SETUP: MatchSetup = { mode: 'coop', ranked: false, map: 'empty' };

function config(edit: (c: GameConfig) => void = () => {}): GameConfig {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.waves.firstWaveDelay = 1000; // no waves unless a test adds enemies
  c.player.maxHp = 1e6;
  edit(c);
  return c;
}

/** A host and `clients` joined players in one room, a match started, and a frame-stepping helper. */
async function startMatch(clients = 1, opts: { latency?: number; edit?: (c: GameConfig) => void } = {}) {
  const hub = new MemoryHub(opts.latency ?? 50);
  const hostRoom = RoomSession.host(hub.join('host'), { code: 'ABC123', name: 'Hana', setup: SETUP, maxPlayers: 4, isPublic: false });
  const clientRooms: RoomSession[] = [];
  for (let i = 0; i < clients; i++) {
    const joining = RoomSession.join(hub.join(`c${i}`), 'ABC123', `Client ${i}`);
    hub.advance(500);
    clientRooms.push(await joining);
  }
  const cfg = config(opts.edit);
  const msg: StartMsg = { setup: SETUP, config: cfg, seed: 7, players: hostRoom.players };
  let clientStarts = 0;
  for (const r of clientRooms) r.onStart = () => clientStarts++;
  hostRoom.start(msg);
  hub.advance(200);
  expect(clientStarts).toBe(clients);
  const ids = msg.players.map((p) => p.id);
  const host = new HostDriver(new World(msg.config, msg.seed, ids), hostRoom);
  const drivers = clientRooms.map((r) => new ClientDriver(new World(msg.config, msg.seed, ids), r));
  const events = { host: [] as SimEvent[], clients: drivers.map(() => [] as SimEvent[]) };
  /** Run `seconds` of frames; `intents` maps 'host' / 'c0'... to that player's input. */
  const run = (seconds: number, intents: Record<string, PlayerIntent> = {}) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      events.host.push(...host.step(DT, intents.host ?? idle));
      drivers.forEach((d, i) => events.clients[i].push(...d.step(DT, intents[`c${i}`] ?? idle)));
      hub.advance(DT * 1000);
    }
  };
  return { hub, hostRoom, clientRooms, host, clients: drivers, run, events };
}

const right: PlayerIntent = { ...idle, move: { x: 1, y: 0 } };

describe('rooms', () => {
  it('a joining player gets the roster; the host sees them', async () => {
    const { hostRoom, clientRooms } = await startMatch(2);
    expect(hostRoom.players.map((p) => p.name)).toEqual(['Hana', 'Client 0', 'Client 1']);
    expect(clientRooms[1].players.map((p) => p.id)).toEqual(['host', 'c0', 'c1']);
    expect(clientRooms[0].hostId).toBe('host');
  });

  it('refuses players when the room is full, the game has started, or the version differs', async () => {
    const hub = new MemoryHub(10);
    const host = RoomSession.host(hub.join('host'), { code: 'FULL22', name: 'H', setup: SETUP, maxPlayers: 2, isPublic: false });
    const first = RoomSession.join(hub.join('a'), 'FULL22', 'A');
    hub.advance(100);
    await first;
    const second = RoomSession.join(hub.join('b'), 'FULL22', 'B');
    hub.advance(100);
    await expect(second).rejects.toThrow(/full/);

    host.maxPlayers = 4;
    host.start({ setup: SETUP, config: config(), seed: 1, players: host.players });
    const late = RoomSession.join(hub.join('c'), 'FULL22', 'C');
    hub.advance(100);
    await expect(late).rejects.toThrow(/already started/);

    host.backToLobby();
    const old = hub.join('d');
    let refused = '';
    old.on(CH.refuse, (d) => (refused = (d as RefuseMsg).reason));
    old.send(CH.hello, { v: PROTOCOL_VERSION + 1, game: 'old', name: 'Old' }, 'host');
    hub.advance(100);
    expect(refused).toMatch(/different version/);
  });
});

describe('playing together', () => {
  it("a client's inputs move its mage on the host, and its own screen responds instantly", async () => {
    const { host, clients, run } = await startMatch(1);
    const startX = host.world.player('c0')!.x;
    run(DT, { c0: right });
    // Predicted locally on the very first frame, before the host has even heard about it.
    expect(clients[0].world.player('c0')!.x).toBeGreaterThan(startX);
    expect(host.world.player('c0')!.x).toBe(startX);
    run(1, { c0: right });
    run(0.5);
    const onHost = host.world.player('c0')!.x;
    expect(onHost).toBeGreaterThan(startX + 100);
    expect(Math.abs(clients[0].world.player('c0')!.x - onHost)).toBeLessThan(1);
  });

  it('the host and other players appear on the client, smoothly and slightly behind', async () => {
    const { host, clients, run } = await startMatch(1);
    run(1, { host: right });
    run(0.5);
    const hx = host.world.player('host')!.x;
    expect(Math.abs(clients[0].world.player('host')!.x - hx)).toBeLessThan(1);
    // Enemies follow too.
    host.world.enemies.push({ id: 500, kind: 'chaser', x: 100, y: 100, radius: 14, hp: 50, maxHp: 50, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1 } as EnemyState);
    run(0.4);
    expect(clients[0].world.enemies.map((e) => [e.id, e.x, e.y])).toEqual([[500, 100, 100]]);
  });

  it("a client's answers count on the host: mana for correct, a stun for wrong, and nobody's game slows down", async () => {
    const { host, clients, run, events } = await startMatch(1);
    const before = host.world.player('c0')!.mana;
    clients[0].answer(0, true, 1);
    run(0.3);
    expect(host.world.player('c0')!.mana).toBe(before + DEFAULT_CONFIG.questionTypes[0].manaReward);
    expect(events.clients[0].some((e) => e.type === 'mana' && e.playerId === 'c0')).toBe(true);
    expect(host.world.player('host')!.mana).toBe(DEFAULT_CONFIG.player.startMana);

    clients[0].answer(0, false, 1);
    // The client treats itself as stunned straight away, before the host confirms.
    run(DT);
    expect(clients[0].world.canAnswer('c0')).toBe(false);
    run(0.3);
    expect(host.world.player('c0')!.stunRemaining).toBeGreaterThan(0);
    expect(host.world.timeScale()).toBe(1);
  });

  it('teammates can revive each other across the network', async () => {
    const { host, clients, run } = await startMatch(1);
    const h = host.world.player('host')!;
    const c = host.world.player('c0')!;
    c.x = h.x + 40;
    c.y = h.y;
    (host.world as unknown as { damagePlayer(p: unknown, n: number): void }).damagePlayer(h, 1e9);
    run(0.3);
    expect(clients[0].world.player('host')!.alive).toBe(false);
    run(3.3, { c0: { ...idle, reviving: true } });
    expect(host.world.player('host')!.alive).toBe(true);
    run(0.3);
    expect(clients[0].world.player('host')!.alive).toBe(true);
  });

  it('game over reaches every player', async () => {
    const { host, clients, run, events } = await startMatch(2);
    for (const p of host.world.players) {
      p.invulnRemaining = 0;
      (host.world as unknown as { damagePlayer(p: unknown, n: number): void }).damagePlayer(p, 1e9);
    }
    run(0.5);
    for (let i = 0; i < 2; i++) {
      expect(clients[i].world.over).toBe(true);
      expect(events.clients[i].some((e) => e.type === 'gameOver')).toBe(true);
    }
  });

  it("the host's pause reaches clients", async () => {
    const { host, clients, hub } = await startMatch(1);
    let paused: boolean | undefined;
    clients[0].onRemotePause = (p) => (paused = p);
    host.setPaused(true);
    hub.advance(100);
    expect(paused).toBe(true);
    expect(clients[0].canPause).toBe(false);
  });

  it("a client leaving removes its mage; the host leaving closes the room for everyone", async () => {
    const { host, hostRoom, clientRooms, hub } = await startMatch(2);
    clientRooms[0].leave();
    hub.advance(200);
    expect(host.world.player('c0')).toBeUndefined();
    expect(hostRoom.players.map((p) => p.id)).toEqual(['host', 'c1']);
    let closed = '';
    clientRooms[1].onClosed = (reason) => (closed = reason);
    hostRoom.leave();
    hub.advance(200);
    expect(closed).toMatch(/host left/);
  });

  it('ranked co-op: clients send the host their peak ELO; the host shares the submission result', async () => {
    const { host, clients, hub } = await startMatch(2);
    host.team.sendPeak(1200);
    clients[0].team.sendPeak(900);
    clients[1].team.sendPeak(1500);
    hub.advance(200);
    expect(Object.fromEntries(host.team.peaks)).toEqual({ host: 1200, c0: 900, c1: 1500 });
    const got: SubmittedMsg[] = [];
    clients[1].team.onSubmitted = (m) => got.push(m);
    host.team.broadcastSubmitted({ result: { id: 3, rankByWave: 2, rankByElo: 5 } });
    hub.advance(200);
    expect(got).toEqual([{ result: { id: 3, rankByWave: 2, rankByElo: 5 } }]);
  });
});

describe('snapshots', () => {
  it('encode → apply reproduces the world for drawing', () => {
    const world = new World(config(), 3, ['a', 'b']);
    world.players[1].alive = false;
    world.players[0].x = 123.456;
    world.enemies.push({ id: 9, kind: 'caster', x: 10.04, y: 20, radius: 13, hp: 7, maxHp: 10, speed: 70, damage: 4, attackTimer: 1, strafe: 1 });
    world.wave.round = 4;
    const mirror = new World(config(), 3, ['a', 'b']);
    applySnapshot(mirror, JSON.parse(JSON.stringify(encodeSnapshot(world, 1000, {}))));
    expect(mirror.players[0].x).toBeCloseTo(123.5, 5);
    expect(mirror.players[1].alive).toBe(false);
    expect(mirror.enemies[0]).toMatchObject({ id: 9, kind: 'caster', x: 10, hp: 7 });
    expect(mirror.wave.round).toBe(4);
    expect(mirror.wave.roundTimeLeft).toBe(Infinity);
  });
});

describe('characters', () => {
  it("each player's chosen character reaches the roster, the match and other players' screens", async () => {
    const hub = new MemoryHub(20);
    const host = RoomSession.host(hub.join('host'), { code: 'CHAR22', name: 'Hana', character: 'gold', setup: SETUP, maxPlayers: 4, isPublic: false });
    const joining = RoomSession.join(hub.join('c0'), 'CHAR22', 'Bob', undefined, 'silver');
    hub.advance(200);
    const client = await joining;
    expect(client.players.map((p) => p.character)).toEqual(['gold', 'silver']);
    // As main.ts does when a match starts: the world's mages take the roster's characters.
    const world = new World(config(), 1, host.players.map((p) => p.id));
    for (const p of host.players) world.player(p.id)!.character = p.character!;
    const mirror = new World(config(), 1, host.players.map((p) => p.id));
    applySnapshot(mirror, JSON.parse(JSON.stringify(encodeSnapshot(world, 0, {}))));
    expect(mirror.players.map((p) => p.character)).toEqual(['gold', 'silver']);
  });
});

describe('responsive casting', () => {
  const SPARK = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Spark');
  const LASER = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Laser');
  const fire = (spell: number): PlayerIntent => ({ ...idle, casting: true, spell });

  it("a client's spark appears on its own screen instantly, then hands over to the host's real one", async () => {
    const { host, clients, run } = await startMatch(1, { edit: (c) => (c.player.startMana = 100) });
    run(0.3); // let snapshots (and mana) flow
    run(DT, { c0: fire(SPARK) });
    const mine = () => clients[0].world.projectiles.filter((p) => p.ownerId === 'c0');
    expect(mine()).toHaveLength(1); // the instant ghost
    expect(mine()[0].id).toBeLessThan(0);
    expect(host.world.projectiles).toHaveLength(0); // the host hasn't heard about it yet
    run(0.3);
    // Now the real projectile has arrived and replaced the ghost: still exactly one, with a real id.
    expect(mine()).toHaveLength(1);
    expect(mine()[0].id).toBeGreaterThan(0);
    // ...and it's drawn close to where the host has it right now (not 100 ms behind).
    const real = host.world.projectiles[0];
    expect(Math.abs(mine()[0].x - real.x)).toBeLessThan(60);
  });

  it("a client's laser beam shows instantly, and isn't drawn a second time when the host's arrives", async () => {
    const { run, events } = await startMatch(1, { edit: (c) => (c.player.startMana = 100) });
    run(0.3);
    events.clients[0].length = 0;
    run(DT, { c0: fire(LASER) });
    expect(events.clients[0].filter((e) => e.type === 'beam')).toHaveLength(1);
    run(0.5);
    expect(events.clients[0].filter((e) => e.type === 'beam')).toHaveLength(1);
  });

  it('other players see the shot too (as the real projectile)', async () => {
    const { host, clients, run } = await startMatch(1, { edit: (c) => (c.player.startMana = 100) });
    run(0.3);
    run(DT, { host: { ...fire(SPARK), aim: -Math.PI / 2 } }); // upwards, away from the teammate (friendly fire)
    run(0.2);
    expect(clients[0].world.projectiles.filter((p) => p.ownerId === 'host')).toHaveLength(1);
    expect(host.world.projectiles).toHaveLength(1);
  });
});

describe('reconnecting', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("a client whose connection blips mid-match keeps its mage and carries on when it's back", async () => {
    RoomSession.reconnectGraceMs = 300;
    const { hub, host, hostRoom, run } = await startMatch(1);
    hub.disconnect('c0');
    run(0.2, { c0: right });
    // Waiting for them: the mage is still there (standing still), and so is their roster entry.
    expect(host.world.player('c0')).toBeDefined();
    expect(hostRoom.players.map((p) => p.id)).toContain('c0');
    const x = host.world.player('c0')!.x;
    hub.reconnect('c0');
    run(0.5, { c0: right });
    expect(host.world.player('c0')!.x).toBeGreaterThan(x + 50);
    await wait(400); // past the grace period: nothing should be removed now
    expect(host.world.player('c0')).toBeDefined();
  });

  it('a client gone longer than the grace period is removed', async () => {
    RoomSession.reconnectGraceMs = 100;
    const { hub, host, hostRoom, run } = await startMatch(1);
    hub.disconnect('c0');
    run(0.2);
    await wait(200);
    expect(host.world.player('c0')).toBeUndefined();
    expect(hostRoom.players.map((p) => p.id)).toEqual(['host']);
  });

  it('clients wait for a host that blips, and only give up after the grace period', async () => {
    RoomSession.reconnectGraceMs = 150;
    const { hub, clientRooms, run } = await startMatch(1);
    let closed = '';
    clientRooms[0].onClosed = (reason) => (closed = reason);
    hub.disconnect('host');
    run(0.1);
    hub.reconnect('host');
    run(0.1);
    await wait(250);
    expect(closed).toBe('');
    hub.disconnect('host');
    run(0.1);
    await wait(250);
    expect(closed).toMatch(/host left/);
    RoomSession.reconnectGraceMs = 20_000;
  });
});

describe('FFA PvP over the network', () => {
  it("the victim's screen learns who killed them and with what, sees the score, and then respawns", async () => {
    const LASER = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Laser');
    const { host, clients, run, events } = await startMatch(1, { edit: (c) => (c.player.startMana = 100) });
    host.world.pvp = true;
    clients[0].world.pvp = true;
    const h = host.world.player('host')!;
    const c = host.world.player('c0')!;
    c.x = h.x + 120;
    c.y = h.y;
    c.hp = 1;
    run(DT, { host: { ...idle, casting: true, spell: LASER } });
    run(0.4);
    expect(events.clients[0].find((e) => e.type === 'killed')).toMatchObject({ victimId: 'c0', killerId: 'host', cause: { kind: 'spell', spell: LASER } });
    const mine = clients[0].world.player('c0')!;
    expect(mine.alive).toBe(false);
    expect(clients[0].world.player('host')!.kills).toBe(1);
    run(DEFAULT_CONFIG.ffa.respawnSeconds + 0.3);
    expect(clients[0].world.player('c0')!.alive).toBe(true);
    expect(events.clients[0].some((e) => e.type === 'respawned' && e.playerId === 'c0')).toBe(true);
  });
});
