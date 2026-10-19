import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, mergeWithDefaults, type GameConfig } from '../config/gameConfig';
import type { PlayerIntent } from './types';
import { enemyCount, hpScale } from './waves';
import { World } from './world';

const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };

function config(edit: (c: GameConfig) => void = () => {}): GameConfig {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.waves.firstWaveDelay = 1000; // keep enemies away unless a test wants them
  edit(c);
  return c;
}

function run(world: World, seconds: number, intent: PlayerIntent = idle, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) world.step(dt, { local: intent });
}

describe('mana', () => {
  it('rewards correct answers and caps at max mana', () => {
    const world = new World(config((c) => { c.player.startMana = 90; c.player.maxMana = 100; c.questionTypes[0].manaReward = 25; }), 1);
    expect(world.answerQuestion('local', 0, true)).toBe(10);
    expect(world.players[0].mana).toBe(100);
    expect(world.stats.questionTypes[0]).toEqual({ attempts: 1, correct: 1, manaEarned: 10 });
  });

  it('spends mana when casting and refuses to cast without enough', () => {
    const world = new World(config((c) => { c.player.startMana = 5; c.spells[0].manaCost = 4; }), 1);
    run(world, 1, { ...idle, casting: true });
    expect(world.players[0].mana).toBe(1);
    expect(world.stats.manaSpent).toBe(4);
  });
});

describe('stun', () => {
  it('a wrong answer immobilizes the player, blocks answering, then wears off', () => {
    const world = new World(config((c) => { c.questionTypes[1].stunSeconds = 2; }), 1);
    const start = { x: world.players[0].x, y: world.players[0].y };
    world.answerQuestion('local', 1, false);
    expect(world.canAnswer('local')).toBe(false);
    expect(world.answerQuestion('local', 0, true)).toBe(0);
    run(world, 1.5, { ...idle, move: { x: 1, y: 0 } });
    expect(world.players[0].x).toBe(start.x);
    run(world, 1, { ...idle, move: { x: 1, y: 0 } });
    expect(world.players[0].x).toBeGreaterThan(start.x);
    expect(world.canAnswer('local')).toBe(true);
  });

  it('a stun multiplier (used for skips) shortens the stun', () => {
    const world = new World(config((c) => { c.questionTypes[0].stunSeconds = 4; }), 1);
    world.answerQuestion('local', 0, false, 0.5);
    expect(world.players[0].stunRemaining).toBe(2);
    expect(world.drainEvents()).toContainEqual({ type: 'stunned', playerId: 'local', seconds: 2 });
  });

  it('blocks casting only when configured', () => {
    for (const blocksCasting of [true, false]) {
      const world = new World(config((c) => { c.stun.blocksCasting = blocksCasting; }), 1);
      world.answerQuestion('local', 0, false);
      run(world, 0.1, { ...idle, casting: true });
      expect(world.stats.manaSpent > 0).toBe(!blocksCasting);
    }
  });
});

describe('slow motion while reading the solution', () => {
  it('slows the game but not the stun countdown', () => {
    const world = new World(config((c) => { c.stun.slowMotion = 0.25; c.questionTypes[0].stunSeconds = 2; }), 1);
    world.projectiles.push({ id: 999, team: 'enemy', ownerId: 1, x: 0, y: 0, vx: 100, vy: 0, radius: 1, damage: 0, stun: 0, explosionRadius: 0, ttl: 100, color: '#fff' });
    expect(world.timeScale()).toBe(1);
    world.answerQuestion('local', 0, false);
    expect(world.timeScale()).toBe(0.25);
    run(world, 1);
    expect(world.projectiles[0].x).toBeCloseTo(25, 0); // 100 px/s at quarter speed
    expect(world.players[0].stunRemaining).toBeCloseTo(1, 1); // real time
    run(world, 1.05);
    expect(world.players[0].stunRemaining).toBe(0);
    expect(world.timeScale()).toBe(1);
  });
});

describe('player and enemy collision', () => {
  const blocker = (id: number, x: number, y: number) => ({
    id, kind: 'chaser' as const, x, y, radius: 14, hp: 1e9, maxHp: 1e9, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1,
  });

  it('the player cannot walk through an enemy', () => {
    const world = new World(config(), 1);
    const p = world.players[0];
    world.enemies.push(blocker(1, p.x + 100, p.y));
    const right = { ...idle, move: { x: 1, y: 0 } };
    for (let t = 0; t < 3; t += 1 / 60) {
      world.step(1 / 60, { local: right });
      expect(p.x).toBeLessThan(world.enemies[0].x); // never gets past it
    }
    expect(Math.hypot(p.x - world.enemies[0].x, p.y - world.enemies[0].y)).toBeCloseTo(p.radius + 14, 3);
  });

  it('cannot squeeze through a gap narrower than the player', () => {
    const world = new World(config(), 1);
    const p = world.players[0];
    // Two enemies 50px apart (center to center): a 22px gap for a 32px-wide player.
    world.enemies.push(blocker(1, p.x + 100, p.y - 25), blocker(2, p.x + 100, p.y + 25));
    run(world, 3, { ...idle, move: { x: 1, y: 0 } });
    expect(p.x).toBeLessThan(world.enemies[0].x); // still on the near side of the pair
    expect(Math.abs(p.y - (world.enemies[0].y + world.enemies[1].y) / 2)).toBeLessThan(1); // wedged, not slipped around
  });

  it('a moving enemy cannot walk into the player either', () => {
    const world = new World(config((c) => { c.player.maxHp = 1e9; }), 1);
    const p = world.players[0];
    world.enemies.push({ ...blocker(1, p.x + 200, p.y), kind: 'caster', speed: 200 });
    world.cfg.enemies.caster.range = 0; // caster wants to sit on top of the player
    run(world, 3);
    for (const e of world.enemies) expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeGreaterThanOrEqual(p.radius + e.radius - 1e-6);
  });
});

describe('exploding spells', () => {
  function blastWorld(explosionRadius: number) {
    const world = new World(config((c) => {
      c.spells[0].explosionRadius = explosionRadius;
      c.spells[0].damage = 30;
      c.player.startMana = 100;
    }), 1);
    const p = world.players[0];
    const enemy = (id: number, dx: number, dy: number) =>
      world.enemies.push({ id, kind: 'chaser', x: p.x + dx, y: p.y + dy, radius: 14, hp: 100, maxHp: 100, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1 });
    enemy(1, 200, 0); // first in the line of fire
    enemy(2, 260, 0); // close behind: inside a 90px blast
    enemy(3, 200, 70); // off to the side: inside a 90px blast
    enemy(4, 200, 200); // far away: outside the blast
    // Fire one shot straight right (aim 0), then stop casting.
    world.step(1 / 60, { local: { ...idle, aim: 0, casting: true } });
    run(world, 1);
    return world;
  }

  const hp = (world: World, id: number) => world.enemies.find((e) => e.id === id)?.hp;

  it('damages every enemy within the radius of the first impact', () => {
    const world = blastWorld(90);
    expect([hp(world, 1), hp(world, 2), hp(world, 3), hp(world, 4)]).toEqual([70, 70, 70, 100]);
    expect(world.projectiles).toHaveLength(0); // the projectile is consumed
  });

  it('a radius of 0 hits only the first enemy', () => {
    const world = blastWorld(0);
    expect([hp(world, 1), hp(world, 2), hp(world, 3), hp(world, 4)]).toEqual([70, 100, 100, 100]);
  });

  it('emits an explosion event at the impact point', () => {
    const world = new World(config((c) => { c.spells[0].explosionRadius = 50; c.player.startMana = 100; }), 1);
    const p = world.players[0];
    world.enemies.push({ id: 1, kind: 'chaser', x: p.x + 200, y: p.y, radius: 14, hp: 1, maxHp: 1, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1 });
    world.step(1 / 60, { local: { ...idle, aim: 0, casting: true } });
    let blast;
    for (let t = 0; t < 1 && !blast; t += 1 / 60) {
      world.step(1 / 60, { local: idle });
      blast = world.drainEvents().find((e) => e.type === 'explosion');
    }
    expect(blast).toMatchObject({ radius: 50, y: p.y });
    expect(blast!.x).toBeGreaterThan(p.x + 170);
    expect(blast!.x).toBeLessThan(p.x + 200);
  });
});

describe('caster hit-stun', () => {
  it('a caster projectile roots the player briefly without blocking questions', () => {
    const world = new World(config((c) => { c.enemies.caster.stunSeconds = 0.5; }), 1);
    const p = world.players[0];
    world.projectiles.push({ id: 999, team: 'enemy', ownerId: 1, x: p.x, y: p.y, vx: 0, vy: 0, radius: 6, damage: 1, stun: 0.5, explosionRadius: 0, ttl: 1, color: '#fff' });
    world.step(1 / 60, { local: idle }); // the hit lands
    const start = p.x;
    run(world, 0.3, { ...idle, move: { x: 1, y: 0 } });
    expect(p.x).toBe(start);
    expect(world.canAnswer('local')).toBe(true);
    run(world, 0.4, { ...idle, move: { x: 1, y: 0 } });
    expect(p.x).toBeGreaterThan(start);
  });
});

describe('combat and waves', () => {
  it('applies damage multipliers to player projectiles', () => {
    const world = new World(config((c) => { c.player.damageDealtMult = 2.5; }), 1);
    run(world, 0.05, { ...idle, casting: true });
    expect(world.projectiles[0].damage).toBe(DEFAULT_CONFIG.spells[0].damage * 2.5);
  });

  it('scales wave size and enemy hp per round', () => {
    const c = config();
    expect(enemyCount(c, 1)).toBe(c.waves.baseCount);
    expect(enemyCount(c, 3)).toBe(c.waves.baseCount + 2 * c.waves.countGrowth);
    expect(hpScale(c, 1)).toBe(1);
    expect(hpScale(c, 11)).toBeCloseTo(1 + 10 * c.waves.hpGrowthPerRound);
  });

  it('enemies spawn, damage the player (with damageTakenMult) and can end the game', () => {
    const world = new World(config((c) => { c.waves.firstWaveDelay = 0.1; c.player.damageTakenMult = 3; c.player.maxHp = 50; }), 42);
    const hits: number[] = [];
    let over = false;
    for (let t = 0; t < 120 && !over; t += 1 / 60) {
      world.step(1 / 60, { local: idle });
      for (const e of world.drainEvents()) {
        if (e.type === 'playerHit') hits.push(e.amount);
        if (e.type === 'gameOver') over = true;
      }
    }
    expect(world.wave.round).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBeCloseTo(DEFAULT_CONFIG.enemies.chaser.damage * 3);
    expect(over).toBe(true);
  });
});

describe('caster spacing', () => {
  /** Average distance from each caster to its nearest other caster after `seconds`. */
  function spreadAfter(spacing: number, seconds: number): number {
    const world = new World(config((c) => { c.enemies.caster.spacing = spacing; c.enemies.surround = false; c.player.maxHp = 1e9; }), 3);
    const p = world.players[0];
    for (let i = 0; i < 6; i++) {
      world.enemies.push({
        id: 100 + i, kind: 'caster', x: p.x + 300 + i * 3, y: p.y + i * 3, radius: 13,
        hp: 1e9, maxHp: 1e9, speed: 70, damage: 0, attackTimer: 1e9, strafe: 1,
      });
    }
    run(world, seconds);
    const cs = world.enemies;
    const nearest = cs.map((a) => Math.min(...cs.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    return nearest.reduce((s, d) => s + d, 0) / nearest.length;
  }

  it('casters spread out instead of clumping', () => {
    const clumped = spreadAfter(0, 6);
    const spread = spreadAfter(140, 6);
    expect(spread).toBeGreaterThan(clumped * 2);
    expect(spread).toBeGreaterThan(100);
  });
});

describe('surrounding the player', () => {
  const maxGapDegrees = (angles: number[]) => {
    const sorted = [...angles].sort((a, b) => a - b);
    const gaps = sorted.map((a, i) => (i === 0 ? sorted[0] + 2 * Math.PI - sorted.at(-1)! : a - sorted[i - 1]));
    return (Math.max(...gaps) * 180) / Math.PI;
  };

  /** Spawn enemies clustered on one side of the player and run the sim. */
  function surroundWorld(kind: 'chaser' | 'caster', count: number, surround: boolean) {
    const world = new World(config((c) => { c.enemies.surround = surround; c.player.maxHp = 1e9; }), 7);
    const p = world.players[0];
    for (let i = 0; i < count; i++) {
      world.enemies.push({
        id: 100 + i, kind, x: p.x + 420, y: p.y - 60 + i * 15, radius: 13,
        hp: 1e9, maxHp: 1e9, speed: 70, damage: 0, attackTimer: 1e9, strafe: 1,
      });
    }
    return { world, p };
  }

  it('casters settle evenly spaced on a ring at their range', () => {
    const { world, p } = surroundWorld('caster', 6, true);
    run(world, 15);
    expect(maxGapDegrees(world.enemies.map((e) => Math.atan2(e.y - p.y, e.x - p.x)))).toBeLessThan(75); // even = 60°
    for (const e of world.enemies) expect(Math.abs(Math.hypot(e.x - p.x, e.y - p.y) - DEFAULT_CONFIG.enemies.caster.range)).toBeLessThan(40);
  });

  it('chasers ignore surrounding and charge straight in', () => {
    const world = new World(config(), 7);
    const p = world.players[0];
    world.enemies.push({ id: 1, kind: 'chaser', x: p.x + 400, y: p.y, radius: 14, hp: 1e9, maxHp: 1e9, speed: 80, damage: 1, attackTimer: 0, strafe: 1 });
    let hit = false;
    for (let t = 0; t < 10 && !hit; t += 1 / 60) {
      world.step(1 / 60, { local: idle });
      hit = world.drainEvents().some((e) => e.type === 'playerHit');
      expect(world.enemies[0].y).toBeCloseTo(p.y, 6); // straight line, no circling
    }
    expect(hit).toBe(true);
  });
});

describe('round time limit', () => {
  it('starts the next wave on time even with enemies alive, with a growing limit', () => {
    const world = new World(config((c) => {
      c.waves.firstWaveDelay = 0;
      c.waves.roundTimeLimit = 10;
      c.waves.roundTimeGrowth = 2;
      c.player.maxHp = 1e9; // survive the whole test
    }), 1);
    const starts: { round: number; time: number }[] = [];
    let time = 0;
    for (; time < 40; time += 1 / 60) {
      world.step(1 / 60, { local: idle });
      for (const e of world.drainEvents()) if (e.type === 'roundStart') starts.push({ round: e.round, time });
    }
    expect(starts.map((s) => s.round)).toEqual([1, 2, 3, 4]);
    expect(starts[1].time - starts[0].time).toBeCloseTo(10, 1); // round 1: 10s
    expect(starts[2].time - starts[1].time).toBeCloseTo(12, 1); // round 2: 12s
    expect(starts[3].time - starts[2].time).toBeCloseTo(14, 1); // round 3: 14s
    expect(world.enemies.length).toBeGreaterThan(enemyCount(world.cfg, 1)); // survivors carried over
  });

  it('a limit of 0 waits for every enemy to die', () => {
    const world = new World(config((c) => { c.waves.firstWaveDelay = 0; c.waves.roundTimeLimit = 0; c.player.maxHp = 1e9; }), 1);
    run(world, 60);
    expect(world.wave.round).toBe(1);
  });
});

describe('mergeWithDefaults for lists', () => {
  it('fills a saved spell from the default with the same name, and unknown spells from the first default', () => {
    const merged = mergeWithDefaults({ spells: [{ name: 'Fireball', damage: 99 }, { name: 'My custom bolt' }] }) as GameConfig;
    const fireball = DEFAULT_CONFIG.spells.find((s) => s.name === 'Fireball')!;
    expect(merged.spells[0]).toMatchObject({ name: 'Fireball', damage: 99, explosionRadius: fireball.explosionRadius, kind: 'projectile' });
    expect(merged.spells[1]).toMatchObject({ name: 'My custom bolt', kind: 'projectile', explosionRadius: DEFAULT_CONFIG.spells[0].explosionRadius });
  });
});

describe('lasers', () => {
  function laserWorld() {
    const world = new World(config((c) => {
      c.spells = [{ name: 'Laser', kind: 'laser', manaCost: 8, damage: 30, projectileSpeed: 0, cooldown: 0.8, radius: 6, color: '#0f0', explosionRadius: 0, beamLength: 500 }];
      c.player.startMana = 100;
    }), 1);
    const p = world.players[0];
    const enemy = (id: number, dx: number, dy: number) =>
      world.enemies.push({ id, kind: 'chaser', x: p.x + dx, y: p.y + dy, radius: 14, hp: 100, maxHp: 100, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1 });
    enemy(1, 100, 0); // in line
    enemy(2, 250, 15); // in line (edge of the beam touches it)
    enemy(3, 400, 0); // in line, behind two others
    enemy(4, 200, 60); // beside the line
    enemy(5, 700, 0); // in line but past the beam length
    return world;
  }
  const hp = (world: World, id: number) => world.enemies.find((e) => e.id === id)?.hp;

  it('instantly damages every enemy along the beam, through all of them', () => {
    const world = laserWorld();
    world.step(1 / 60, { local: { ...idle, aim: 0, casting: true } });
    expect([1, 2, 3, 4, 5].map((id) => hp(world, id))).toEqual([70, 70, 70, 100, 100]);
    expect(world.projectiles).toHaveLength(0);
    expect(world.players[0].mana).toBe(92);
  });

  it('respects its cooldown and emits a beam event', () => {
    const world = laserWorld();
    world.step(1 / 60, { local: { ...idle, aim: 0, casting: true } });
    expect(world.drainEvents().some((e) => e.type === 'beam')).toBe(true);
    run(world, 0.5, { ...idle, aim: 0, casting: true }); // still cooling down
    expect(hp(world, 1)).toBe(70);
    run(world, 0.4, { ...idle, aim: 0, casting: true }); // cooldown over: second shot
    expect(hp(world, 1)).toBe(40);
  });
});

describe('mergeWithDefaults', () => {
  it('fills missing fields from defaults and keeps saved values', () => {
    const merged = mergeWithDefaults({ player: { maxHp: 7 }, spells: [{ name: 'Only' }] }) as GameConfig;
    expect(merged.player.maxHp).toBe(7);
    expect(merged.player.speed).toBe(DEFAULT_CONFIG.player.speed);
    expect(merged.spells).toHaveLength(1);
    expect(merged.spells[0].name).toBe('Only');
    expect(merged.spells[0].damage).toBe(DEFAULT_CONFIG.spells[0].damage);
    expect(merged.waves).toEqual(DEFAULT_CONFIG.waves);
  });
});
