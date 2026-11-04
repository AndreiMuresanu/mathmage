import type { GameConfig } from '../config/gameConfig';
import type { MatchSetup } from '../game/matchSetup';
import type { SubmitScoreResponse } from '../online/leaderboardTypes';
import type { EnemyKind, MatchStats, PlayerIntent, PlayerState, SimEvent, WaveState } from '../sim/types';
import type { World } from '../sim/world';

/** Bump whenever messages change shape; peers with different versions refuse to play together. */
export const PROTOCOL_VERSION = 1;

/** Channel names (see Transport.send / on). */
export const CH = {
  hello: 'hello',
  roster: 'roster',
  refuse: 'refuse',
  start: 'start',
  intent: 'intent',
  answer: 'answer',
  snap: 'snap',
  pause: 'pause',
  peak: 'peak',
  submitted: 'submitted',
} as const;

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface HelloMsg {
  v: number;
  game: string;
  name: string;
}

/** Host → everyone: who's in the room and what will be played. */
export interface RosterMsg {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  setup: MatchSetup;
  maxPlayers: number;
  started: boolean;
}

export interface RefuseMsg {
  reason: string;
}

/** Host → everyone: the match begins with exactly this config and seed. */
export interface StartMsg {
  setup: MatchSetup;
  config: GameConfig;
  seed: number;
  players: RoomPlayer[];
}

/** Client → host, every frame. `dt` is how long the client applied it for (prediction replay). */
export interface IntentMsg extends PlayerIntent {
  seq: number;
  dt: number;
}

export interface AnswerMsg {
  typeIndex: number;
  correct: boolean;
  stunMultiplier: number;
}

/** Host → everyone, ~20 times a second: the world, plus the events since the last one. */
export interface SnapMsg {
  s: Snapshot;
  events: SimEvent[];
}

export interface PauseMsg {
  paused: boolean;
}

/** Client → host at game over: this player's peak ELO, for the ranked co-op team entry. */
export interface PeakMsg {
  elo: number;
}

/** Host → everyone: how the team's leaderboard submission went. */
export interface SubmittedMsg {
  result: SubmitScoreResponse | null;
  error?: string;
}

// ------------------------------------------------------------------ snapshots

/** [id, kind (0 chaser / 1 caster), x, y, radius, hp, maxHp] */
type EnemyTuple = [number, number, number, number, number, number, number];
/** [id, team (0 player / 1 enemy), x, y, radius, color] */
type ProjectileTuple = [number, number, number, number, number, string];
/** [id, x, y, radius, ttl (null = forever), heal] */
type PickupTuple = [number, number, number, number, number | null, number];

/** Everything a client needs to draw the match. Numbers are rounded to keep messages small. */
export interface Snapshot {
  /** Host match clock (ms). */
  t: number;
  /** Per client: the last intent seq the host has applied. */
  acks: Record<string, number>;
  players: PlayerState[];
  enemies: EnemyTuple[];
  projectiles: ProjectileTuple[];
  pickups: PickupTuple[];
  wave: Omit<WaveState, 'queue' | 'roundTimeLeft'> & { queue: number; roundTimeLeft: number | null };
  stats: MatchStats;
  over: boolean;
}

const KINDS: EnemyKind[] = ['chaser', 'caster'];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function encodeSnapshot(world: World, t: number, acks: Record<string, number>): Snapshot {
  return {
    t,
    acks: { ...acks },
    players: world.players.map((p) => ({
      ...p,
      x: r1(p.x),
      y: r1(p.y),
      hp: r2(p.hp),
      mana: r2(p.mana),
      aim: r2(p.aim),
      stunRemaining: r2(p.stunRemaining),
      hitStunRemaining: r2(p.hitStunRemaining),
      invulnRemaining: r2(p.invulnRemaining),
      reviveProgress: r2(p.reviveProgress),
      cooldowns: p.cooldowns.map(r2),
      questionStats: p.questionStats.map((q) => ({ ...q })),
    })),
    enemies: world.enemies.map((e) => [e.id, KINDS.indexOf(e.kind), r1(e.x), r1(e.y), e.radius, r1(e.hp), r1(e.maxHp)]),
    projectiles: world.projectiles.map((p) => [p.id, p.team === 'player' ? 0 : 1, r1(p.x), r1(p.y), p.radius, p.color]),
    pickups: world.pickups.map((o) => [o.id, r1(o.x), r1(o.y), o.radius, Number.isFinite(o.ttl) ? r2(o.ttl) : null, o.heal]),
    wave: {
      round: world.wave.round,
      phase: world.wave.phase,
      timer: r2(world.wave.timer),
      queue: world.wave.queue.length,
      roundTimeLeft: Number.isFinite(world.wave.roundTimeLeft) ? r2(world.wave.roundTimeLeft) : null,
    },
    stats: { ...world.stats, questionTypes: world.stats.questionTypes.map((q) => ({ ...q })) },
    over: world.over,
  };
}

/** Overwrite a client's mirror World with a snapshot (the renderer then draws it as usual). */
export function applySnapshot(world: World, s: Snapshot): void {
  world.players = s.players.map((p) => ({ ...p, cooldowns: [...p.cooldowns], questionStats: p.questionStats.map((q) => ({ ...q })) }));
  world.enemies = s.enemies.map(([id, kind, x, y, radius, hp, maxHp]) => ({
    id,
    kind: KINDS[kind] ?? 'chaser',
    x,
    y,
    radius,
    hp,
    maxHp,
    speed: 0,
    damage: 0,
    attackTimer: 0,
    strafe: 1,
  }));
  world.projectiles = s.projectiles.map(([id, team, x, y, radius, color]) => ({
    id,
    team: team === 0 ? 'player' : 'enemy',
    ownerId: '',
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    damage: 0,
    stun: 0,
    explosionRadius: 0,
    ttl: 1,
    color,
  }));
  world.pickups = s.pickups.map(([id, x, y, radius, ttl, heal]) => ({ id, x, y, radius, ttl: ttl ?? Infinity, heal }));
  world.wave = {
    round: s.wave.round,
    phase: s.wave.phase,
    timer: s.wave.timer,
    queue: new Array<EnemyKind>(s.wave.queue).fill('chaser'),
    roundTimeLeft: s.wave.roundTimeLeft ?? Infinity,
  };
  world.stats = { ...s.stats, questionTypes: s.stats.questionTypes.map((q) => ({ ...q })) };
  world.over = s.over;
}

/**
 * A snapshot between `a` and `b` (alpha 0 → a, 1 → b): positions of things present in both are
 * blended, so remote players, enemies and projectiles move smoothly between 20 Hz updates.
 */
export function interpolateSnapshots(a: Snapshot, b: Snapshot, alpha: number): Snapshot {
  const k = Math.max(0, Math.min(1, alpha));
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const before = <T extends unknown[]>(list: T[]) => new Map(list.map((row) => [row[0] as number, row]));
  const oldEnemies = before(a.enemies);
  const oldShots = before(a.projectiles);
  const oldPlayers = new Map(a.players.map((p) => [p.id, p]));
  return {
    ...b,
    t: lerp(a.t, b.t),
    players: b.players.map((p) => {
      const o = oldPlayers.get(p.id);
      return o ? { ...p, x: lerp(o.x, p.x), y: lerp(o.y, p.y) } : p;
    }),
    enemies: b.enemies.map((e) => {
      const o = oldEnemies.get(e[0]);
      return o ? ([e[0], e[1], lerp(o[2], e[2]), lerp(o[3], e[3]), e[4], e[5], e[6]] as EnemyTuple) : e;
    }),
    projectiles: b.projectiles.map((p) => {
      const o = oldShots.get(p[0]);
      return o ? ([p[0], p[1], lerp(o[2], p[2]), lerp(o[3], p[3]), p[4], p[5]] as ProjectileTuple) : p;
    }),
  };
}
