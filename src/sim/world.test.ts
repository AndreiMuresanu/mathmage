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
    const world = new World(config((c) => { c.player.startMana = 90; c.player.maxMana = 100; c.questionSlots[0].manaReward = 25; }), 1);
    expect(world.answerQuestion('local', 0, true)).toBe(10);
    expect(world.players[0].mana).toBe(100);
    expect(world.stats.slots[0]).toEqual({ attempts: 1, correct: 1, manaEarned: 10 });
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
    const world = new World(config((c) => { c.questionSlots[1].stunSeconds = 2; }), 1);
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
