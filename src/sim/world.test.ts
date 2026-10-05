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
    world.projectiles.push({ id: 999, team: 'enemy', ownerId: 1, x: 0, y: 0, vx: 100, vy: 0, radius: 1, damage: 0, stun: 0, ttl: 100, color: '#fff' });
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

describe('caster hit-stun', () => {
  it('a caster projectile roots the player briefly without blocking questions', () => {
    const world = new World(config((c) => { c.enemies.caster.stunSeconds = 0.5; }), 1);
    const p = world.players[0];
    world.projectiles.push({ id: 999, team: 'enemy', ownerId: 1, x: p.x, y: p.y, vx: 0, vy: 0, radius: 6, damage: 1, stun: 0.5, ttl: 1, color: '#fff' });
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
    const world = new World(config((c) => { c.enemies.caster.spacing = spacing; c.player.maxHp = 1e9; }), 3);
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
