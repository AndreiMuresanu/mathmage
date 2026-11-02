import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import type { MapDef, Rect } from './maps';
import { NavGrid } from './pathfinding';
import type { PlayerIntent } from './types';
import { World } from './world';

const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };

describe('NavGrid', () => {
  it('measures path distance around walls, not straight-line distance', () => {
    // 10×5 cells of 20px. A wall down the middle leaves only the bottom row open.
    const open = new NavGrid([], 200, 100, 20, 5);
    open.update([{ x: 10, y: 10 }]);
    expect(open.dist[open.cellAt(190, 10)]).toBe(9);

    const walled = new NavGrid([{ x: 90, y: 0, w: 20, h: 75 }], 200, 100, 20, 5);
    walled.update([{ x: 10, y: 10 }]);
    const around = walled.dist[walled.cellAt(190, 10)];
    expect(Number.isFinite(around)).toBe(true);
    expect(around).toBeGreaterThan(12);
    expect(walled.blocked[walled.cellAt(100, 10)]).toBe(1);
  });

  it('closes gaps narrower than an enemy', () => {
    // Two walls with a 20px gap between them; a 14px-radius enemy can't fit through.
    const walls: Rect[] = [{ x: 90, y: 0, w: 20, h: 40 }, { x: 90, y: 60, w: 20, h: 40 }];
    const narrow = new NavGrid(walls, 200, 100, 20, 14);
    narrow.update([{ x: 10, y: 50 }]);
    expect(narrow.dist[narrow.cellAt(190, 50)]).toBe(Infinity);
    const thin = new NavGrid(walls, 200, 100, 20, 5);
    thin.update([{ x: 10, y: 50 }]);
    expect(Number.isFinite(thin.dist[thin.cellAt(190, 50)])).toBe(true);
  });

  it('never cuts diagonally between two blocked cells', () => {
    // 3×3 cells; the corner cell (0,0) touches the open grid only diagonally.
    const grid = new NavGrid([{ x: 20, y: 0, w: 20, h: 20 }, { x: 0, y: 20, w: 20, h: 20 }], 60, 60, 20, 1);
    grid.update([{ x: 30, y: 30 }]);
    expect(grid.dist[grid.cellAt(10, 10)]).toBe(Infinity);
    expect(grid.dist[grid.cellAt(50, 50)]).toBeCloseTo(Math.SQRT2, 6);
  });

  it('only recomputes when a target changes cell', () => {
    const grid = new NavGrid([{ x: 90, y: 0, w: 20, h: 75 }], 200, 100, 20, 5);
    expect(grid.update([{ x: 10, y: 10 }])).toBe(true);
    expect(grid.update([{ x: 15, y: 12 }])).toBe(false);
    expect(grid.update([{ x: 30, y: 12 }])).toBe(true);
  });

  it('points downhill toward the target', () => {
    const grid = new NavGrid([{ x: 90, y: 0, w: 20, h: 75 }], 200, 100, 20, 5);
    grid.update([{ x: 10, y: 10 }]);
    // Right of the wall, the way to the target is down to the gap first.
    const [, dy] = grid.directionFrom(150, 10)!;
    expect(dy).toBeGreaterThan(0);
    expect(grid.directionFrom(10, 10)).toBeUndefined(); // already there
  });
});

describe('enemies following the flow field', () => {
  function config(edit: (c: GameConfig) => void = () => {}): GameConfig {
    const c = cloneConfig(DEFAULT_CONFIG);
    c.waves.firstWaveDelay = 1000;
    c.player.maxHp = 1e9;
    edit(c);
    return c;
  }
  const testMap = (walls: Rect[], player = { x: 900, y: 360 }): MapDef => ({ id: 'test', name: 'Test', walls, playerSpawn: player });
  const run = (world: World, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) world.step(1 / 60, { local: idle });
  };
  const chaser = (x: number, y: number, speed = 100) =>
    ({ id: 1, kind: 'chaser' as const, x, y, radius: 14, hp: 100, maxHp: 100, speed, damage: 0, attackTimer: 1e9, strafe: 1 as const });

  // A U-shaped wall whose open side faces away from the player (who is off to the right).
  const cup: Rect[] = [
    { x: 400, y: 260, w: 200, h: 20 },
    { x: 400, y: 440, w: 200, h: 20 },
    { x: 580, y: 260, w: 20, h: 200 },
  ];

  it('a chaser inside a U-shaped wall walks out the open side and around to the player', () => {
    const world = new World(config(), 1, undefined, testMap(cup));
    world.enemies.push(chaser(540, 360));
    run(world, 15);
    const p = world.players[0];
    const e = world.enemies[0];
    expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeLessThan(p.radius + e.radius + 3);
  });

  it('without pathfinding the same chaser stays stuck against the wall', () => {
    const world = new World(config((c) => { c.enemies.pathfinding = false; }), 1, undefined, testMap(cup));
    world.enemies.push(chaser(540, 360));
    run(world, 15);
    expect(world.enemies[0].x).toBeLessThan(600);
  });

  it('heads for the player with the shorter path, even if another is closer in a straight line', () => {
    // A long wall with a gap only at the very top separates the enemy from player "a".
    const world = new World(config(), 1, ['a', 'b'], testMap([{ x: 600, y: 100, w: 20, h: 620 }]));
    const [a, b] = world.players;
    Object.assign(a, { x: 680, y: 600 }); // 120px away, but behind the wall
    Object.assign(b, { x: 300, y: 600 }); // 260px away, nothing in between
    world.enemies.push(chaser(560, 600));
    for (let t = 0; t < 1; t += 1 / 60) world.step(1 / 60, {});
    expect(world.enemies[0].x).toBeLessThan(530);
  });

  it('casters hold fire without a clear shot', () => {
    const caster = (x: number) => ({ ...chaser(x, 360, 0), kind: 'caster' as const, radius: 13, damage: 1, attackTimer: 0 });
    const blocked = new World(config(), 1, undefined, testMap([{ x: 600, y: 0, w: 20, h: 720 }], { x: 700, y: 360 }));
    blocked.enemies.push(caster(500));
    run(blocked, 3);
    expect(blocked.projectiles.filter((p) => p.team === 'enemy')).toHaveLength(0);

    const open = new World(config(), 1, undefined, testMap([{ x: 600, y: 0, w: 20, h: 100 }], { x: 700, y: 360 }));
    open.enemies.push(caster(500));
    run(open, 0.1); // fires at once (attack timer 0); check before the shot reaches the player
    expect(open.projectiles.filter((p) => p.team === 'enemy').length).toBeGreaterThan(0);
  });
});
