import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import { circleRectPush, getMap } from './maps';
import type { PlayerIntent, SimEvent } from './types';
import { World } from './world';

const DT = 1 / 60;
const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };
const STAR = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Star');
const LASER = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Laser');
const FFA = DEFAULT_CONFIG.ffa;

function ffaWorld(edit: (c: GameConfig) => void = () => {}, ids = ['a', 'b']) {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.player.startMana = 100;
  c.player.maxMana = 100;
  edit(c);
  const world = new World(c, 1, ids);
  world.pvp = true;
  world.sharedTime = true;
  return world;
}

function run(world: World, seconds: number, intents: Record<string, PlayerIntent> = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    world.step(DT, intents);
    events.push(...world.drainEvents());
  }
  return events;
}

/** Put b right of a and have a laser them (one-shot: b is set to low HP). */
function laserKill(world: World, killer = 'a', victim = 'b'): SimEvent[] {
  const k = world.player(killer)!;
  const v = world.player(victim)!;
  v.x = k.x + 120;
  v.y = k.y;
  v.hp = 1;
  v.invulnRemaining = 0;
  k.cooldowns.fill(0);
  k.mana = 100;
  return run(world, DT, { [killer]: { ...idle, casting: true, spell: LASER } });
}

describe('FFA PvP', () => {
  it('spells hit opponents at full damage, whatever co-op friendly fire is set to', () => {
    const world = ffaWorld((c) => (c.coop.friendlyFire = 0));
    const [a, b] = world.players;
    b.x = a.x + 150;
    b.y = a.y;
    run(world, DT, { a: { ...idle, casting: true, spell: STAR } });
    run(world, 1);
    expect(b.hp).toBe(100 - DEFAULT_CONFIG.spells[STAR].damage);
  });

  it('a kill is credited to the attacker, with the spell that did it', () => {
    const world = ffaWorld();
    const events = laserKill(world);
    expect(world.player('a')!.kills).toBe(1);
    expect(world.player('b')!.deaths).toBe(1);
    expect(events.find((e) => e.type === 'killed')).toMatchObject({ victimId: 'b', killerId: 'a', cause: { kind: 'spell', spell: LASER } });
  });

  it('dead players respawn after the delay, away from others, with full HP and spawn protection', () => {
    const world = ffaWorld();
    laserKill(world);
    const b = world.player('b')!;
    expect(b.alive).toBe(false);
    expect(b.respawnIn).toBeCloseTo(FFA.respawnSeconds, 1);
    run(world, FFA.respawnSeconds - 0.2);
    expect(b.alive).toBe(false);
    const events = run(world, 0.3);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(b.maxHp);
    expect(b.invulnRemaining).toBeGreaterThan(FFA.spawnProtectionSeconds - 0.2);
    expect(events.some((e) => e.type === 'respawned' && e.playerId === 'b')).toBe(true);
    const a = world.player('a')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(200);
    // Protected: a laser right away does nothing.
    a.cooldowns.fill(0);
    b.x = a.x + 120;
    b.y = a.y;
    run(world, DT, { a: { ...idle, casting: true, spell: LASER } });
    expect(b.hp).toBe(b.maxHp);
  });

  it('there are no revives, and everyone being dead is not game over', () => {
    const world = ffaWorld();
    laserKill(world);
    const a = world.player('a')!;
    a.invulnRemaining = 0;
    (world as unknown as { damagePlayer(p: unknown, n: number): void }).damagePlayer(a, 1e9);
    run(world, 0.5, { a: { ...idle, reviving: true }, b: { ...idle, reviving: true } });
    expect(world.over).toBe(false);
    expect(world.players.every((p) => p.reviveProgress === 0)).toBe(true);
  });

  it('first to the kill target wins', () => {
    const world = ffaWorld((c) => (c.ffa.killTarget = 2));
    laserKill(world);
    expect(world.over).toBe(false);
    run(world, FFA.respawnSeconds + 0.1);
    world.player('b')!.invulnRemaining = 0;
    const events = laserKill(world);
    expect(world.over).toBe(true);
    expect(world.winnerIds).toEqual(['a']);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('with a time limit, the most kills when time runs out wins (ties share it); endless never ends on its own', () => {
    const timed = ffaWorld((c) => {
      c.ffa.winCondition = 'time';
      c.ffa.timeLimitMinutes = 1;
    }, ['a', 'b', 'c']);
    laserKill(timed, 'a', 'b');
    run(timed, 30);
    expect(timed.over).toBe(false);
    run(timed, 31);
    expect(timed.over).toBe(true);
    expect(timed.winnerIds).toEqual(['a']);

    const endless = ffaWorld((c) => (c.ffa.winCondition = 'endless'));
    run(endless, 120);
    expect(endless.over).toBe(false);
    endless.endMatch();
    expect(endless.over).toBe(true);
    expect(endless.winnerIds).toEqual(['a', 'b']); // nobody scored: a tie
  });

  it('no enemies by default; with enemies on, wave size follows the enemy amount', () => {
    const none = ffaWorld((c) => (c.waves.firstWaveDelay = 0.1));
    run(none, 5);
    expect(none.wave.round).toBe(0);
    expect(none.enemies).toHaveLength(0);

    const sizeAt = (amount: number) => {
      const w = ffaWorld((c) => {
        c.ffa.enemies = true;
        c.ffa.enemyAmount = amount;
        c.waves.firstWaveDelay = 0.05;
      });
      run(w, 0.1);
      return w.enemies.length + w.wave.queue.length;
    };
    expect(sizeAt(2)).toBe(sizeAt(1) * 2);
  });

  it('an enemy kill gives no player credit, and says what did it', () => {
    const world = ffaWorld((c) => (c.ffa.enemies = true));
    const b = world.player('b')!;
    b.hp = 1;
    world.enemies.push({ id: 77, kind: 'chaser', x: b.x + 20, y: b.y, radius: 14, hp: 10, maxHp: 10, speed: 0, damage: 5, attackTimer: 0, strafe: 1 });
    const events = run(world, 0.2);
    expect(events.find((e) => e.type === 'killed')).toMatchObject({ victimId: 'b', killerId: null, cause: { kind: 'enemy', enemy: 'chaser' } });
    expect(world.player('a')!.kills).toBe(0);
  });

  it('a laser that passes through an opponent twice (out and back after a bounce) deals both passes', () => {
    const world = ffaWorld((c) => (c.map = 'boxy'));
    const [a, b] = world.players;
    a.x = 300; // under Boxy's solid top wall
    a.y = 360;
    b.x = 300;
    b.y = 100; // between a and the top wall: hit going up, and again coming back down
    run(world, DT, { a: { ...idle, aim: -Math.PI / 2, casting: true, spell: LASER } });
    const laser = DEFAULT_CONFIG.spells[LASER];
    expect(b.hp).toBeCloseTo(100 - (laser.damage + laser.damage * (1 + laser.bounceDamagePercent / 100)), 6);
  });

  it('players start spread out and clear of walls', () => {
    const world = ffaWorld((c) => (c.map = 'buttons'), ['a', 'b', 'c', 'd']);
    world.placeForPvp();
    for (const p of world.players) for (const w of getMap('buttons').walls) expect(circleRectPush(p, w)).toBeUndefined();
    const [a, b] = world.players;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(200);
  });
});
