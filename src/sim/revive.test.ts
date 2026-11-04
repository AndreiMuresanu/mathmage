import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import { circleRectPush, getMap } from './maps';
import type { EnemyState, PlayerIntent, SimEvent } from './types';
import { World } from './world';

const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };
const holdF: PlayerIntent = { ...idle, reviving: true };
const DT = 1 / 60;

function config(edit: (c: GameConfig) => void = () => {}): GameConfig {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.waves.firstWaveDelay = 1000; // no waves unless a test adds enemies
  edit(c);
  return c;
}

/** Two mages: "a" standing, "b" downed right next to them. */
function downedTeammate(edit?: (c: GameConfig) => void) {
  const world = new World(config(edit), 1, ['a', 'b']);
  const [a, b] = world.players;
  b.x = a.x + 40;
  b.y = a.y;
  knockOut(world, 'b');
  return { world, a, b };
}

function knockOut(world: World, id: string) {
  const p = world.player(id)!;
  p.invulnRemaining = 0;
  (world as unknown as { damagePlayer(p: unknown, n: number): void }).damagePlayer(p, 1e9);
}

/** Step for `seconds` with fixed intents per player; returns all events. */
function run(world: World, seconds: number, intents: Record<string, PlayerIntent>): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    world.step(DT, intents);
    events.push(...world.drainEvents());
  }
  return events;
}

const chaser = (x: number, y: number): EnemyState =>
  ({ id: 99, kind: 'chaser', x, y, radius: 14, hp: 1e9, maxHp: 1e9, speed: 80, damage: 5, attackTimer: 0, strafe: 1 });

describe('going down', () => {
  it('a downed mage stays in the world but cannot move, cast or answer', () => {
    const { world, b } = downedTeammate();
    expect(world.players).toHaveLength(2);
    expect(b.alive).toBe(false);
    const x = b.x;
    run(world, 0.5, { a: idle, b: { move: { x: 1, y: 0 }, aim: 0, casting: true } });
    expect(b.x).toBe(x);
    expect(world.projectiles).toHaveLength(0);
    expect(world.canAnswer('b')).toBe(false);
    expect(world.answerQuestion('b', 0, true)).toBe(0);
  });

  it('enemies ignore the body and go for the mage still standing', () => {
    const { world, a, b } = downedTeammate();
    world.enemies.push(chaser(b.x + 200, b.y)); // nearer the body than the standing mage
    run(world, 1, { a: idle });
    const e = world.enemies[0];
    expect(Math.hypot(e.x - a.x, e.y - a.y)).toBeLessThan(200);
    expect(b.hp).toBe(0);
  });

  it('the match only ends when every mage is down', () => {
    const { world } = downedTeammate();
    run(world, 0.2, {});
    expect(world.over).toBe(false);
    knockOut(world, 'a');
    const events = run(world, DT, {});
    expect(world.over).toBe(true);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('solo: going down is game over straight away', () => {
    const world = new World(config(), 1);
    knockOut(world, 'local');
    run(world, DT, {});
    expect(world.over).toBe(true);
  });
});

describe('reviving', () => {
  it('holding F next to the body for the revive time brings them back at half HP with a window of invincibility', () => {
    const { world, a, b } = downedTeammate();
    let events = run(world, 2.9, { a: holdF });
    expect(b.alive).toBe(false);
    expect(b.reviveProgress).toBeGreaterThan(2.8);
    events = run(world, 0.2, { a: holdF });
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(50);
    expect(b.invulnRemaining).toBeGreaterThan(2.7);
    expect(b.reviveProgress).toBe(0);
    expect(events.find((e) => e.type === 'revived')).toMatchObject({ playerId: 'b', byId: 'a' });
    // Invincible for now: a hit does nothing.
    (world as unknown as { damagePlayer(p: unknown, n: number): void }).damagePlayer(b, 30);
    expect(b.hp).toBe(50);
    expect(a.alive).toBe(true);
  });

  it('letting go of F resets the progress', () => {
    const { world, b } = downedTeammate();
    run(world, 2, { a: holdF });
    run(world, DT, { a: idle });
    expect(b.reviveProgress).toBe(0);
    run(world, 2, { a: holdF });
    expect(b.alive).toBe(false);
  });

  it('moving out of reach resets the progress, and F does nothing from far away', () => {
    const { world, a, b } = downedTeammate();
    run(world, 2, { a: holdF });
    a.x = b.x + 200;
    run(world, DT, { a: holdF });
    expect(b.reviveProgress).toBe(0);
    run(world, 4, { a: holdF });
    expect(b.alive).toBe(false);
  });

  it('a wrong-answer stun blocks reviving; a caster hit-stun or taking damage does not', () => {
    const { world, a, b } = downedTeammate();
    world.answerQuestion('a', 0, false); // stunned for the type's stun time
    run(world, 1, { a: holdF });
    expect(b.reviveProgress).toBe(0);

    a.stunRemaining = 0;
    a.hitStunRemaining = 0.5;
    run(world, 1, { a: holdF });
    expect(b.reviveProgress).toBeGreaterThan(0.9);
    a.invulnRemaining = 0;
    (world as unknown as { damagePlayer(p: unknown, n: number, stun?: number): void }).damagePlayer(a, 5, 0.3);
    run(world, 2.1, { a: holdF });
    expect(b.alive).toBe(true);
  });

  it('two teammates reviving together are no faster than one', () => {
    const world = new World(config(), 1, ['a', 'b', 'c']);
    const [a, b, c] = world.players;
    b.x = a.x + 40;
    b.y = a.y;
    c.x = b.x + 40;
    c.y = b.y;
    knockOut(world, 'b');
    run(world, 2.9, { a: holdF, c: holdF });
    expect(b.alive).toBe(false);
    run(world, 0.2, { a: holdF, c: holdF });
    expect(b.alive).toBe(true);
  });

  it('respects custom revive time and HP', () => {
    const { world, b } = downedTeammate((c) => {
      c.coop.reviveSeconds = 1;
      c.coop.reviveHpFraction = 0.25;
      c.coop.reviveInvulnSeconds = 0;
    });
    run(world, 1.05, { a: holdF });
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(25);
    expect(b.invulnRemaining).toBe(0);
  });

  it('reviveTarget reports who the local mage could revive', () => {
    const { world, a, b } = downedTeammate();
    expect(world.reviveTarget('a')).toBe(b);
    expect(world.reviveTarget('b')).toBeUndefined(); // downed mages can't revive
    a.x = b.x + 300;
    expect(world.reviveTarget('a')).toBeUndefined();
  });
});

describe('addPlayer', () => {
  it('adds a mage clear of walls who enemies can target', () => {
    const cfg = config((c) => { c.map = 'buttons'; });
    const world = new World(cfg, 1);
    const bot = world.addPlayer('bot-1');
    for (const w of getMap('buttons').walls) expect(circleRectPush(bot, w)).toBeUndefined();
    expect(world.players.map((p) => p.id)).toEqual(['local', 'bot-1']);
    const me = world.players[0];
    me.x = 100;
    me.y = 100;
    world.enemies.push(chaser(bot.x + 120, bot.y));
    run(world, 1, {});
    const e = world.enemies[0];
    expect(Math.hypot(e.x - bot.x, e.y - bot.y)).toBeLessThan(80);
  });
});
