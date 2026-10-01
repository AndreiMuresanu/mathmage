import type { GameConfig } from '../config/gameConfig';
import type { Rng } from '../util/rng';
import type { EnemyKind } from './types';

export function enemyCount(cfg: GameConfig, round: number): number {
  return Math.max(1, Math.round(cfg.waves.baseCount + cfg.waves.countGrowth * (round - 1)));
}

export function hpScale(cfg: GameConfig, round: number): number {
  return cfg.enemies.hpMult * (1 + cfg.waves.hpGrowthPerRound * (round - 1));
}

export function damageScale(cfg: GameConfig, round: number): number {
  return cfg.enemies.damageMult * (1 + cfg.waves.damageGrowthPerRound * (round - 1));
}

/** The spawn order for a round: casters (from casterStartRound on) mixed randomly among chasers. */
export function buildWaveQueue(cfg: GameConfig, round: number, rng: Rng): EnemyKind[] {
  const total = enemyCount(cfg, round);
  const casters = round >= cfg.waves.casterStartRound ? Math.round(total * cfg.waves.casterFraction) : 0;
  const queue: EnemyKind[] = [];
  for (let i = 0; i < total; i++) queue.push(i < casters ? 'caster' : 'chaser');
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}
