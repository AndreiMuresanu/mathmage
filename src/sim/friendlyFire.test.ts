import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import type { EnemyState, PlayerIntent } from './types';
import { World } from './world';

const DT = 1 / 60;
const idle: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };
const SPARK = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Spark');
const FIREBALL = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Fireball');
const LASER = DEFAULT_CONFIG.spells.findIndex((s) => s.name === 'Laser');

/** Caster "a" and teammate "b" (`dx` to the right of a); a casts `spell` once, aiming right. */
function cast(spell: number, dx: number, edit: (c: GameConfig) => void = () => {}, setup: (w: World) => void = () => {}) {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.waves.firstWaveDelay = 1000;
  c.player.startMana = 100;
  edit(c);
  const world = new World(c, 1, ['a', 'b']);
  const [a, b] = world.players;
  b.x = a.x + dx;
  b.y = a.y;
  setup(world);
  world.step(DT, { a: { ...idle, casting: true, spell } });
  for (let t = 0; t < 1.5; t += DT) world.step(DT, { a: { ...idle, spell } });
  return { world, a, b };
}

const chaser = (x: number, y: number): EnemyState =>
  ({ id: 50, kind: 'chaser', x, y, radius: 14, hp: 1000, maxHp: 1000, speed: 0, damage: 0, attackTimer: 1e9, strafe: 1 });

describe('friendly fire', () => {
  const spark = DEFAULT_CONFIG.spells[SPARK].damage;
  const fireball = DEFAULT_CONFIG.spells[FIREBALL].damage;
  const laser = DEFAULT_CONFIG.spells[LASER].damage;

  it('a spark that hits a teammate hurts them and stops there', () => {
    const { world, a, b } = cast(SPARK, 150);
    expect(b.hp).toBe(100 - spark);
    expect(a.hp).toBe(100);
    expect(world.projectiles).toHaveLength(0);
  });

  it('can be scaled down or switched off', () => {
    expect(cast(SPARK, 150, (c) => (c.coop.friendlyFire = 0.5)).b.hp).toBe(100 - spark * 0.5);
    const off = cast(SPARK, 150, (c) => (c.coop.friendlyFire = 0));
    expect(off.b.hp).toBe(100);
  });

  it('a fireball explodes on a teammate, and its blast hurts teammates near an enemy — never the caster', () => {
    expect(cast(FIREBALL, 150).b.hp).toBe(100 - fireball);
    // Point-blank at an enemy right next to the caster: the teammate beside the enemy is hurt, the caster isn't.
    const near = cast(FIREBALL, 80, () => {}, (w) => {
      const a = w.player('a')!;
      w.enemies.push(chaser(a.x + 45, a.y));
      w.player('b')!.y = a.y + 40;
    });
    expect(near.b.hp).toBe(100 - fireball);
    expect(near.a.hp).toBe(100);
  });

  it('a laser hurts every teammate along the beam', () => {
    const { b } = cast(LASER, 200);
    expect(b.hp).toBe(100 - laser);
  });

  it('downed teammates are not hit', () => {
    const downed = cast(SPARK, 150, () => {}, (w) => {
      const b = w.player('b')!;
      b.alive = false;
      b.hp = 0;
    });
    expect(downed.b.hp).toBe(0);
    expect(downed.b.alive).toBe(false);
  });
});
